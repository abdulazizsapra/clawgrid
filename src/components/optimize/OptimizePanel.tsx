'use client'
import { sshExec } from '@/lib/utils'
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Sparkles, RefreshCw, Play, AlertTriangle, CheckCircle, TrendingDown,
  Brain, Clock, Shield, Terminal, Zap, DollarSign, ChevronDown, ChevronUp,
  ArrowRight, X, Bot, Copy, Check, SendHorizonal
} from 'lucide-react'
import type { OpenClawInstance } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'good'

interface Finding {
  severity: Severity
  title: string
  detail: string
  action?: string
  savings?: string
}

interface AnalysisResult {
  score: number        // 0-100
  label: string
  findings: Finding[]
  summary: string
}

type AnalysisKey = 'cost' | 'crons' | 'memory' | 'logs' | 'security' | 'skills'

interface AnalysisState {
  status: 'idle' | 'running' | 'done' | 'error'
  result?: AnalysisResult
  error?: string
  ranAt?: string
}

// ─── Model pricing (per 1M tokens) ───────────────────────────────────────────

const MODEL_PRICE: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':   { input: 3.00,  output: 15.00 },
  'claude-opus-4-8':     { input: 15.00, output: 75.00 },
  'claude-haiku-4-5':    { input: 0.25,  output: 1.25  },
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
  'gpt-4o':              { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':         { input: 0.15,  output: 0.60  },
}

function getPrice(model: string) {
  const key = Object.keys(MODEL_PRICE).find(k => model.includes(k))
  return key ? MODEL_PRICE[key] : { input: 3.00, output: 15.00 }
}

function runsPerDay(expr: string): number {
  if (!expr) return 0
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return 0
  const [min, hour] = parts
  if (min.startsWith('*/')) return (24 * 60) / parseInt(min.slice(2))
  if (hour.startsWith('*/')) return 24 / parseInt(hour.slice(2))
  if (hour === '*') return 24
  return 1
}


// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size / 2) - 6
  const circ = 2 * Math.PI * r
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface3)" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${circ * score / 100} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size === 64 ? 16 : 11, fontWeight: 800, color }}>{score}</span>
      </div>
    </div>
  )
}

// ─── Severity config ──────────────────────────────────────────────────────────

const SEV: Record<Severity, { color: string; bg: string; icon: React.ReactNode }> = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.07)', icon: <AlertTriangle size={12} /> },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.07)', icon: <AlertTriangle size={12} /> },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', icon: <AlertTriangle size={12} /> },
  low:      { color: '#64748b', bg: 'rgba(100,116,139,0.07)', icon: <CheckCircle size={12} /> },
  good:     { color: '#22c55e', bg: 'rgba(34,197,94,0.07)', icon: <CheckCircle size={12} /> },
}

// ─── Analyzers ────────────────────────────────────────────────────────────────

async function analyzeCost(instanceId: string, wp: string): Promise<AnalysisResult> {
  const out = await sshExec(instanceId, `python3 << 'PYEOF'
import json, os
wp = "${wp}"
jobs = json.load(open(wp+"/cron/jobs.json")).get("jobs", [])
state = json.load(open(wp+"/cron/jobs-state.json")).get("jobs", {})
result = []
for j in jobs:
    if not j.get("enabled"): continue
    st = state.get(j["id"], {}).get("state") or state.get(j["id"], {})
    msg = j.get("payload", {}).get("message", "")
    model = j.get("payload", {}).get("model", "unknown")
    expr = j.get("schedule", {}).get("expr", "")
    dur_ms = st.get("lastDurationMs") or 0
    result.append({"name": j.get("name","?"), "model": model,
        "prompt_chars": len(msg), "schedule": expr, "dur_ms": dur_ms,
        "timeout_sec": j.get("payload",{}).get("timeoutSeconds",300)})
print(json.dumps(result))
PYEOF`)

  let jobs: Array<{ name: string; model: string; prompt_chars: number; schedule: string; dur_ms: number; timeout_sec: number }>
  try { jobs = JSON.parse(out.trim() || '[]') } catch { jobs = JSON.parse('[]') }

  const findings: Finding[] = []
  let totalMonthlyCost = 0

  // Per-job cost estimate
  const jobCosts = jobs.map(j => {
    const price = getPrice(j.model)
    const inputTok = Math.round(j.prompt_chars / 4)
    // Estimate output: ~2x input for agentic tasks, cap at reasonable amount
    const outputTok = Math.min(inputTok * 2, 4000)
    const perRun = (inputTok * price.input + outputTok * price.output) / 1_000_000
    const perDay = perRun * runsPerDay(j.schedule)
    const perMonth = perDay * 30
    totalMonthlyCost += perMonth
    return { ...j, perRun, perDay, perMonth, inputTok, outputTok }
  })

  // Most expensive job
  const sorted = [...jobCosts].sort((a, b) => b.perMonth - a.perMonth)
  if (sorted[0]?.perMonth > 0.10) {
    findings.push({
      severity: 'high',
      title: `"${sorted[0].name}" costs ~$${sorted[0].perMonth.toFixed(2)}/month`,
      detail: `${sorted[0].inputTok} input tokens per run × ${runsPerDay(sorted[0].schedule).toFixed(1)} runs/day on ${sorted[0].model.split('/').pop()}`,
      action: 'Consider reducing the prompt size or switching to claude-haiku-4-5 for this job',
      savings: `Could save ~$${(sorted[0].perMonth * 0.9).toFixed(2)}/mo by switching to Haiku`,
    })
  }

  // Jobs using Sonnet when Haiku would suffice
  const sonnetJobs = jobCosts.filter(j => j.model.includes('sonnet') && j.prompt_chars < 1000)
  if (sonnetJobs.length > 3) {
    const haikuSavings = sonnetJobs.reduce((s, j) => s + j.perMonth * 0.92, 0)
    findings.push({
      severity: 'medium',
      title: `${sonnetJobs.length} simple jobs using Sonnet instead of Haiku`,
      detail: `Jobs with small prompts (<1000 chars) don't need Sonnet-level reasoning`,
      action: `Switch to anthropic/claude-haiku-4-5 for: ${sonnetJobs.slice(0, 3).map(j => j.name).join(', ')}`,
      savings: `~$${haikuSavings.toFixed(2)}/month saved`,
    })
  }

  // Long-running jobs (potential timeout waste)
  const longJobs = jobCosts.filter(j => j.dur_ms > 120_000)
  if (longJobs.length > 0) {
    findings.push({
      severity: 'medium',
      title: `${longJobs.length} jobs run >2 minutes each`,
      detail: `Long jobs: ${longJobs.map(j => `${j.name} (${(j.dur_ms/60000).toFixed(1)}m)`).join(', ')}`,
      action: 'Break long jobs into smaller focused tasks or reduce their scope',
    })
  }

  // Total cost
  if (totalMonthlyCost < 1) {
    findings.push({ severity: 'good', title: `Total estimated cost: ~$${(totalMonthlyCost).toFixed(2)}/month`, detail: `${jobs.length} active cron jobs consuming an estimated $${(totalMonthlyCost * 12).toFixed(2)}/year` })
  } else {
    findings.push({ severity: 'medium', title: `Total estimated cost: ~$${totalMonthlyCost.toFixed(2)}/month`, detail: 'Based on prompt sizes and schedule frequencies', savings: 'Switching expensive jobs to Haiku could cut costs by 80%' })
  }

  // Model diversity
  const models = [...new Set(jobs.map(j => j.model.split('/').pop() ?? j.model))]
  findings.push({ severity: 'good', title: `Using ${models.length} model${models.length > 1 ? 's' : ''}: ${models.join(', ')}`, detail: 'Model diversity is good for cost/capability tradeoffs' })

  const score = totalMonthlyCost < 2 ? 90 : totalMonthlyCost < 5 ? 75 : totalMonthlyCost < 10 ? 60 : 40

  return {
    score,
    label: totalMonthlyCost < 2 ? 'Low cost' : totalMonthlyCost < 5 ? 'Moderate' : 'High cost',
    summary: `~$${totalMonthlyCost.toFixed(2)}/month across ${jobs.length} active jobs`,
    findings,
  }
}

async function analyzeCrons(instanceId: string, wp: string): Promise<AnalysisResult> {
  const out = await sshExec(instanceId, `python3 << 'PYEOF'
import json
wp = "${wp}"
jobs = json.load(open(wp+"/cron/jobs.json")).get("jobs", [])
state = json.load(open(wp+"/cron/jobs-state.json")).get("jobs", {})
result = []
for j in jobs:
    st = state.get(j["id"], {}).get("state") or state.get(j["id"], {})
    result.append({"id": j["id"][:8], "name": j.get("name","?"), "enabled": j.get("enabled",False),
        "schedule": j.get("schedule",{}).get("expr",""), "errors": st.get("consecutiveErrors",0) or 0,
        "lastError": st.get("lastError"), "dur_ms": st.get("lastDurationMs"), "hasRun": st.get("lastRunAtMs") is not None})
print(json.dumps(result))
PYEOF`)

  let jobs: Array<{ name: string; enabled: boolean; schedule: string; errors: number; lastError?: string; dur_ms?: number; hasRun: boolean }>
  try { jobs = JSON.parse(out.trim() || '[]') } catch { jobs = JSON.parse('[]') }

  const findings: Finding[] = []
  const errored = jobs.filter(j => j.errors > 0)
  const neverRun = jobs.filter(j => j.enabled && !j.hasRun)
  const disabled = jobs.filter(j => !j.enabled)

  if (errored.length > 0) {
    findings.push({
      severity: 'high',
      title: `${errored.length} job${errored.length > 1 ? 's' : ''} have consecutive errors`,
      detail: errored.slice(0, 3).map(j => `"${j.name}": ${j.lastError ?? 'unknown error'}`).join('; '),
      action: 'Go to Crons → select each errored job → click "Reset Error" to allow retry on next scheduled run',
    })
  }

  if (neverRun.length > 0) {
    findings.push({
      severity: 'medium',
      title: `${neverRun.length} enabled jobs have never run`,
      detail: neverRun.map(j => j.name).slice(0, 4).join(', '),
      action: 'Verify these jobs are scheduled correctly and the gateway was running at their scheduled time',
    })
  }

  if (disabled.length > 0) {
    findings.push({
      severity: 'low',
      title: `${disabled.length} jobs are paused`,
      detail: disabled.map(j => j.name).slice(0, 4).join(', '),
      action: 'Review paused jobs — enable if needed or delete if obsolete',
    })
  }

  const highFreq = jobs.filter(j => j.enabled && runsPerDay(j.schedule) >= 24)
  if (highFreq.length > 0) {
    findings.push({
      severity: 'medium',
      title: `${highFreq.length} jobs run hourly or more`,
      detail: highFreq.map(j => j.name).join(', '),
      action: 'Ensure high-frequency jobs are genuinely needed at that cadence',
    })
  }

  const longJobs = jobs.filter(j => (j.dur_ms ?? 0) > 180_000)
  if (longJobs.length > 0) {
    findings.push({ severity: 'medium', title: `${longJobs.length} jobs take >3 minutes`, detail: longJobs.map(j => `${j.name} (${((j.dur_ms ?? 0)/60000).toFixed(1)}m)`).join(', '), action: 'Consider splitting long jobs or increasing timeouts' })
  }

  if (errored.length === 0 && neverRun.length === 0) {
    findings.push({ severity: 'good', title: 'All enabled jobs have run successfully', detail: `${jobs.filter(j => j.enabled).length} active jobs with no errors` })
  }

  const errorRate = errored.length / Math.max(jobs.length, 1)
  const score = Math.round(100 - (errorRate * 50) - (neverRun.length * 5) - (highFreq.length * 3))

  return {
    score: Math.max(10, Math.min(100, score)),
    label: errored.length === 0 ? 'Healthy' : `${errored.length} errors`,
    summary: `${jobs.filter(j => j.enabled).length} active, ${errored.length} errored, ${disabled.length} paused`,
    findings,
  }
}

async function analyzeMemory(instanceId: string, wp: string): Promise<AnalysisResult> {
  const out = await sshExec(instanceId, `python3 << 'PYEOF'
import json, os, sqlite3, time
wp = "${wp}"
result = {}
try:
    conn = sqlite3.connect(wp+"/memory/main.sqlite")
    files = conn.execute("SELECT path, size, mtime FROM files ORDER BY mtime ASC").fetchall()
    chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    total_size = sum(f[1] or 0 for f in files)
    now = time.time()
    stale = [f for f in files if f[2] and (now - f[2]) > 30*86400]
    large = [f for f in files if (f[1] or 0) > 50000]
    conn.close()
    result = {"file_count": len(files), "chunk_count": chunks, "total_size": total_size,
              "stale_count": len(stale), "large_count": len(large),
              "stale_files": [f[0].split("/")[-1] for f in stale[:3]],
              "large_files": [(f[0].split("/")[-1], f[1]) for f in large[:3]]}
except Exception as e:
    result["err"] = str(e)
print(json.dumps(result))
PYEOF`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: Record<string, any> = {}
  try { data = JSON.parse(out.trim() || '{}') } catch { /* use default */ }
  const findings: Finding[] = []

  if (data.err) return { score: 50, label: 'Unknown', summary: 'Could not read memory database', findings: [{ severity: 'medium', title: 'Memory database unavailable', detail: String(data.err) }] }

  if (data.stale_count > 0) {
    findings.push({ severity: 'medium', title: `${data.stale_count} memory files not updated in 30+ days`, detail: `Stale files: ${data.stale_files?.join(', ')}`, action: 'Review and archive memories that are no longer relevant to reduce context load' })
  }
  if (data.large_count > 0) {
    findings.push({ severity: 'medium', title: `${data.large_count} memory files exceed 50KB`, detail: data.large_files?.map((f: [string, number]) => `${f[0]} (${(f[1]/1024).toFixed(1)}KB)`).join(', '), action: 'Large memory files increase token usage on every turn. Consider summarising and archiving.' })
  }
  if (data.total_size > 500_000) {
    findings.push({ severity: 'high', title: `Total memory size: ${(data.total_size/1024).toFixed(0)}KB`, detail: 'Large total memory increases token overhead per agent interaction', action: 'Ask the agent to consolidate and prune its memory' })
  }
  if (data.stale_count === 0 && data.large_count === 0) {
    findings.push({ severity: 'good', title: `Memory is healthy — ${data.file_count} files, ${(data.total_size/1024).toFixed(0)}KB total`, detail: 'No stale or oversized memory files found' })
  }
  findings.push({ severity: 'good', title: `${data.chunk_count} memory chunks across ${data.file_count} files`, detail: 'Memory is properly indexed and searchable' })

  const score = data.stale_count > 5 ? 50 : data.large_count > 3 ? 65 : data.stale_count > 0 ? 75 : 90
  return { score, label: score >= 80 ? 'Healthy' : 'Needs pruning', summary: `${data.file_count} files · ${(data.total_size/1024).toFixed(0)}KB · ${data.stale_count} stale`, findings }
}

async function analyzeLogs(instanceId: string, wp: string): Promise<AnalysisResult> {
  const out = await sshExec(instanceId, `python3 << 'PYEOF'
import json, re
wp = "${wp}"
try:
    log = open(wp+"/gateway.log").read()
    lines = log.splitlines()
    errors = [l for l in lines if re.search(r"error|Error|ERROR|fail|crash", l)]
    restarts = [l for l in lines if re.search(r"start|listen|ready|Start|Ready", l, re.IGNORECASE)]
    # Get last 3 errors
    recent_errors = errors[-3:] if errors else []
    print(json.dumps({"total_lines": len(lines), "error_count": len(errors), "restart_count": len(restarts), "recent_errors": recent_errors, "last_lines": lines[-3:]}))
except Exception as e:
    print(json.dumps({"err": str(e)}))
PYEOF`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: Record<string, any> = {}
  try { data = JSON.parse(out.trim() || '{}') } catch { /* use default */ }
  const findings: Finding[] = []

  if (data.restart_count > 10) {
    findings.push({ severity: 'high', title: `Gateway restarted ${data.restart_count} times`, detail: 'Frequent restarts may indicate instability or crashes. Interrupted cron jobs can be caused by restarts.', action: 'Check for memory issues or misconfigured plugins causing crashes. Consider setting up the systemd service.' })
  } else if (data.restart_count > 3) {
    findings.push({ severity: 'medium', title: `${data.restart_count} gateway restarts recorded`, detail: 'Some restarts are normal, but frequent restarts should be investigated' })
  }

  if (data.error_count > 0) {
    findings.push({ severity: data.error_count > 10 ? 'high' : 'medium', title: `${data.error_count} error log entries`, detail: data.recent_errors?.slice(0, 2).join('\n') ?? '', action: 'Review recent errors in the Logs page' })
  } else {
    findings.push({ severity: 'good', title: 'No errors in gateway log', detail: `${data.total_lines} log lines, no error patterns detected` })
  }

  if (data.restart_count > 0) {
    findings.push({ severity: 'low', title: 'Consider setting up gateway as a systemd service', detail: 'Running via PM2 or systemd ensures the gateway restarts automatically and stays healthy', action: 'Add openclaw gateway to /etc/systemd/system/openclaw.service' })
  }

  const score = data.error_count === 0 && data.restart_count <= 3 ? 92 : data.restart_count > 10 ? 55 : 75
  return { score, label: score >= 80 ? 'Healthy' : 'Needs attention', summary: `${data.total_lines} log lines · ${data.error_count} errors · ${data.restart_count} restarts`, findings }
}

async function analyzeSecurity(instanceId: string, wp: string): Promise<AnalysisResult> {
  const out = await sshExec(instanceId, `python3 << 'PYEOF'
import json, subprocess
wp = "${wp}"
results = {}
try:
    ea = json.load(open(wp+"/exec-approvals.json"))
    agents = ea.get("agents", {})
    results["agent_count"] = len(agents)
    results["agents"] = {k: {"sec": v.get("security"), "ask": v.get("ask"), "autoSkills": v.get("autoAllowSkills"), "allowlist": len(v.get("allowlist",[])), "blocklist": len(v.get("blocklist",[]))} for k,v in agents.items()}
    results["defaults"] = ea.get("defaults", {})
except Exception as e: results["ea_err"] = str(e)
try:
    sudo = subprocess.run(["sudo", "-l", "-n"], capture_output=True, text=True)
    results["sudo_nopasswd"] = "NOPASSWD: ALL" in sudo.stdout
except: results["sudo_nopasswd"] = False
try:
    ak = open("/home/openclaw/.ssh/authorized_keys").read().strip().splitlines()
    results["ssh_keys"] = len([l for l in ak if l and not l.startswith("#")])
except: results["ssh_keys"] = 0
print(json.dumps(results))
PYEOF`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: Record<string, any> = {}
  try { data = JSON.parse(out.trim() || '{}') } catch { /* use default */ }
  const findings: Finding[] = []
  let deductions = 0

  if (data.sudo_nopasswd) {
    findings.push({ severity: 'critical', title: 'Agent user has unrestricted NOPASSWD sudo', detail: 'openclaw user can run any command as root with no password — a prompt injection could lead to full VM compromise', action: 'Run: sudo visudo → change to: openclaw ALL=(ALL) NOPASSWD: /bin/systemctl restart openclaw' })
    deductions += 25
  }

  const agents = data.agents ?? {}
  for (const [name, cfg] of Object.entries(agents) as [string, { sec: string; ask: string; autoSkills: boolean; allowlist: number; blocklist: number }][]) {
    if (cfg.ask === 'off') {
      findings.push({ severity: 'high', title: `Agent "${name}": exec ask mode is off`, detail: 'Commands run without human approval — risky with large allowlists', action: `Go to Security → Guardrails → set ask = "on" for agent "${name}"` })
      deductions += 10
    }
    if (cfg.blocklist === 0) {
      findings.push({ severity: 'medium', title: `Agent "${name}": no commands blocked`, detail: 'Without a blocklist, destructive commands could run if allowlisted accidentally', action: 'Add blocklist entries for: rm -rf, curl, wget, nc, ncat' })
      deductions += 5
    }
    if (cfg.sec === 'full') {
      findings.push({ severity: 'good', title: `Agent "${name}" security mode: full`, detail: 'Strict allowlist enforcement is active' })
    }
  }

  if (data.ssh_keys > 3) {
    findings.push({ severity: 'medium', title: `${data.ssh_keys} SSH keys authorised`, detail: 'More keys = more attack surface. Audit and remove any keys no longer in use.', action: 'Review ~/.ssh/authorized_keys and remove stale entries' })
    deductions += 5
  }

  const score = Math.max(20, 100 - deductions)
  return { score, label: deductions === 0 ? 'Secure' : deductions > 25 ? 'At risk' : 'Needs work', summary: `${Object.keys(agents).length} agents · sudo ${data.sudo_nopasswd ? 'unrestricted ⚠' : 'restricted ✓'} · ${data.ssh_keys} SSH keys`, findings }
}

async function analyzeSkills(instanceId: string, wp: string): Promise<AnalysisResult> {
  const out = await sshExec(instanceId, `python3 << 'PYEOF'
import json, os
wp = "${wp}"
try:
    cfg = json.load(open(wp+"/openclaw.json"))
    plugins_data = json.load(open(wp+"/plugins/installs.json"))
    plugins = plugins_data.get("plugins", [])
    enabled_plugins = [p for p in plugins if p.get("enabled")]
    skills = cfg.get("skills", {}).get("entries", {})
    enabled_skills = {k: v for k,v in skills.items() if v.get("enabled")}
    safe_bins = cfg.get("tools", {}).get("exec", {}).get("safeBins", [])
    print(json.dumps({"total_plugins": len(plugins), "enabled_plugins": len(enabled_plugins),
        "total_skills": len(skills), "enabled_skills": len(enabled_skills),
        "enabled_skill_names": list(enabled_skills.keys())[:10],
        "safe_bin_count": len(safe_bins)}))
except Exception as e:
    print(json.dumps({"err": str(e)}))
PYEOF`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: Record<string, any> = {}
  try { data = JSON.parse(out.trim() || '{}') } catch { /* use default */ }
  const findings: Finding[] = []

  const disabledPlugins = (data.total_plugins ?? 0) - (data.enabled_plugins ?? 0)
  if (data.enabled_plugins > 50) {
    findings.push({ severity: 'medium', title: `${data.enabled_plugins} plugins enabled (out of ${data.total_plugins})`, detail: 'Having many enabled plugins increases startup time and potential attack surface', action: 'Review the Skills page and disable any plugins not actively used' })
  } else {
    findings.push({ severity: 'good', title: `${data.enabled_plugins}/${data.total_plugins} plugins enabled`, detail: `${disabledPlugins} plugins disabled — good for security and performance` })
  }

  if (data.enabled_skills === 0) {
    findings.push({ severity: 'low', title: 'No custom skills enabled', detail: 'Custom skills guide agent behaviour in specific scenarios', action: 'Consider enabling skills from ClawHub or creating custom ones for frequent task types' })
  } else {
    findings.push({ severity: 'good', title: `${data.enabled_skills} custom skills active`, detail: data.enabled_skill_names?.join(', ') ?? '' })
  }

  findings.push({ severity: 'good', title: `${data.safe_bin_count} safe binaries configured`, detail: 'Shell tool access is controlled via allowlist' })

  const score = data.enabled_plugins > 60 ? 65 : data.enabled_skills === 0 ? 75 : 88
  return { score, label: 'Configured', summary: `${data.enabled_plugins} plugins · ${data.enabled_skills} skills · ${data.safe_bin_count} tools`, findings }
}

// ─── Agent self-analysis prompt ───────────────────────────────────────────────

function buildAgentPrompt(): string {
  return `You are performing a comprehensive self-optimization audit. Use your available tools to analyze yourself and report findings.

Please investigate each of the following areas and provide a structured report:

## 1. CRON JOBS
Check your cron/jobs.json and cron/jobs-state.json. Which jobs are failing? Which have large prompts that could be simplified? Which run too frequently?

## 2. MEMORY
Check your memory SQLite database. How large is it? Are there stale entries? What topics are consuming the most space?

## 3. PERFORMANCE & LOGS
Check your gateway.log. How many restarts? Any recurring errors? What's causing them?

## 4. COST OPTIMIZATION
Review your cron job models and prompt sizes. Which jobs use expensive models unnecessarily? Where could you switch to Haiku without losing quality?

## 5. SECURITY
Review your exec-approvals.json. Are there risky allowlist patterns? Is ask mode off when it shouldn't be?

## 6. SKILLS & TOOLS
Which tools do you use most? Which are in your allowlist but rarely invoked? Are there capabilities you're missing?

## REPORT FORMAT
For each area, provide:
- **Score**: X/10
- **Top issue**: One sentence
- **Action**: What should be done, with specific file paths or settings to change

Be concise, factual, and specific. Use actual numbers from your files. This report will be shown to your operator.`
}

// ─── Action modal — stream agent executing a single finding's action ──────────

function ActionModal({ instance, finding, onClose }: {
  instance: OpenClawInstance
  finding: Finding
  onClose: () => void
}) {
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running')
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function execute() {
    setStatus('running')
    setOutput('')
    const controller = new AbortController()
    abortRef.current = controller

    const prompt = `Please take the following optimization action now:

**${finding.title}**

Action required: ${finding.action}
${finding.detail ? `\nContext: ${finding.detail}` : ''}
${finding.savings ? `\nPotential savings: ${finding.savings}` : ''}

Use your available tools to implement this change. Read the relevant config files, make the necessary edits, and report exactly what you changed — which files you modified, what values changed, and the before/after state.`

    try {
      const res = await fetch(`/api/gateway/${instance.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openclaw',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`Gateway error ${res.status}`)

      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let assembled = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') { reader.cancel(); break }
          try {
            const chunk = JSON.parse(data)
            const delta = chunk.choices?.[0]?.delta?.content
            if (delta) {
              assembled += delta
              setOutput(assembled)
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
            }
          } catch { /* skip */ }
        }
      }
      setStatus('done')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setOutput(`Error: ${e instanceof Error ? e.message : String(e)}`)
      setStatus('error')
    }
  }

  useEffect(() => { execute() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() { abortRef.current?.abort(); onClose() }

  function copy() {
    navigator.clipboard.writeText(output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const sev = SEV[finding.severity]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <SendHorizonal size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Sending action to agent</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: sev.bg, color: sev.color }}>{finding.severity.toUpperCase()}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{finding.title}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {output && (
              <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            )}
            <button onClick={handleClose} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
          </div>
        </div>

        {/* Action being executed */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>ACTION</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{finding.action}</div>
        </div>

        {/* Streaming output */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }} ref={scrollRef}>
          {status === 'running' && !output && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Agent is working…
            </div>
          )}
          <pre style={{ fontSize: 13, lineHeight: 1.75, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)', margin: 0 }}>
            {output}
            {status === 'running' && <span style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--accent)', animation: 'pulse 1s infinite', marginLeft: 2, verticalAlign: 'middle', borderRadius: 2 }} />}
          </pre>
        </div>

        {/* Footer */}
        {(status === 'done' || status === 'error') && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0 }}>
            <button onClick={execute} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
              <RefreshCw size={12} /> Retry
            </button>
            <button onClick={handleClose} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
              {status === 'done' ? 'Done' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Module card ──────────────────────────────────────────────────────────────

const MODULE_META: Record<AnalysisKey, { label: string; icon: React.ReactNode; description: string }> = {
  cost:     { label: 'Cost & Efficiency', icon: <DollarSign size={14} />, description: 'Token usage and model cost estimates' },
  crons:    { label: 'Cron Health',        icon: <Clock size={14} />,       description: 'Job errors, schedules, performance' },
  memory:   { label: 'Memory',             icon: <Brain size={14} />,       description: 'Memory size, staleness, fragmentation' },
  logs:     { label: 'Gateway Logs',       icon: <Terminal size={14} />,    description: 'Errors, restarts, stability' },
  security: { label: 'Security',           icon: <Shield size={14} />,      description: 'Sudo, exec approvals, SSH keys' },
  skills:   { label: 'Skills & Plugins',   icon: <Zap size={14} />,         description: 'Plugin coverage, skill configuration' },
}

function ModuleCard({ moduleKey, state, onRun, onAskAgent }: {
  moduleKey: AnalysisKey
  state: AnalysisState
  onRun: () => void
  onAskAgent: (f: Finding) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = MODULE_META[moduleKey]

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
      borderColor: state.result && state.result.score < 60 ? 'rgba(239,68,68,0.25)' : 'var(--border)',
    }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        {state.result ? (
          <ScoreRing score={state.result.score} size={52} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-dim)' }}>
            {meta.icon}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{meta.label}</span>
            {state.result && (
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: state.result.score >= 80 ? 'rgba(34,197,94,0.12)' : state.result.score >= 60 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)', color: state.result.score >= 80 ? 'var(--success)' : state.result.score >= 60 ? 'var(--warning)' : 'var(--error)', fontWeight: 600 }}>
                {state.result.label}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {state.result ? state.result.summary : meta.description}
          </div>
          {state.ranAt && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>Last run: {state.ranAt}</div>}
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {state.result && (
            <button onClick={() => setExpanded(e => !e)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer' }}>
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          <button
            onClick={onRun}
            disabled={state.status === 'running'}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: state.status === 'running' ? 'var(--text-dim)' : 'var(--accent)', fontSize: 11, cursor: state.status === 'running' ? 'not-allowed' : 'pointer', fontWeight: 500 }}
          >
            {state.status === 'running' ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={11} />}
            {state.status === 'running' ? 'Running…' : state.status === 'done' ? 'Re-run' : 'Analyze'}
          </button>
        </div>
      </div>

      {/* Findings */}
      {expanded && state.result && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.result.findings.map((f, i) => {
            const s = SEV[f.severity]
            return (
              <div key={i} style={{ background: s.bg, border: `1px solid ${s.color}33`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: f.detail || f.action ? 5 : 0 }}>
                  <span style={{ color: s.color, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{f.title}</span>
                </div>
                {f.detail && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 4px 19px', lineHeight: 1.5 }}>{f.detail}</p>}
                {f.action && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '4px 0 0 19px', padding: '6px 10px', background: 'rgba(59,130,246,0.06)', borderRadius: 6, border: '1px solid rgba(59,130,246,0.15)' }}>
                    <ArrowRight size={11} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, flex: 1 }}>{f.action}</span>
                  </div>
                )}
                {f.savings && <div style={{ fontSize: 11, color: 'var(--success)', margin: '4px 0 0 19px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TrendingDown size={10} /> {f.savings}
                </div>}
                {f.action && (f.severity === 'critical' || f.severity === 'high' || f.severity === 'medium') && (
                  <div style={{ margin: '8px 0 0 19px' }}>
                    <button
                      onClick={() => onAskAgent(f)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(59,130,246,0.3)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
                    >
                      <Bot size={11} /> Ask Agent to Fix This
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {state.error && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', fontSize: 12, color: 'var(--error)' }}>{state.error}</div>
      )}
    </div>
  )
}

// ─── Agent self-analysis panel ────────────────────────────────────────────────

function AgentAnalysisPanel({ instance, onClose }: { instance: OpenClawInstance; onClose: () => void }) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<'analysis' | 'actions'>('analysis')
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevOutputRef = useRef('')

  async function runAnalysis(takeActions = false) {
    setStatus('running')
    setOutput('')
    setMode(takeActions ? 'actions' : 'analysis')

    const messages = takeActions
      ? [
          { role: 'user', content: buildAgentPrompt() },
          { role: 'assistant', content: prevOutputRef.current },
          { role: 'user', content: 'Now please implement all the HIGH and CRITICAL priority actions you identified above. Use your tools to make the actual changes to config files and settings. Report what you changed for each action.' },
        ]
      : [{ role: 'user', content: buildAgentPrompt() }]

    try {
      const res = await fetch(`/api/gateway/${instance.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openclaw',
          messages,
          stream: true,
        }),
      })

      if (!res.ok) throw new Error(`Gateway error ${res.status}`)

      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let assembled = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') { reader.cancel(); break }
          try {
            const chunk = JSON.parse(data)
            const delta = chunk.choices?.[0]?.delta?.content
            if (delta) {
              assembled += delta
              setOutput(assembled)
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
            }
          } catch { /* skip */ }
        }
      }
      prevOutputRef.current = assembled
      setStatus('done')
    } catch (e) {
      setOutput(`Error: ${e instanceof Error ? e.message : String(e)}`)
      setStatus('error')
    }
  }

  function copy() {
    navigator.clipboard.writeText(output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {mode === 'actions' ? 'Agent Taking Actions' : 'Agent Self-Analysis'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {mode === 'actions'
                ? `${instance.name} · Implementing improvements from the analysis`
                : `${instance.name} · Asks the agent to audit itself using its own tools`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {output && <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>}
            <button onClick={onClose} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }} ref={scrollRef}>
          {status === 'idle' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <Bot size={48} style={{ display: 'block', margin: '0 auto 16px', opacity: 0.2 }} />
              <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', margin: '0 0 8px' }}>Agent Self-Analysis</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
                This sends a comprehensive audit prompt to the agent. It will use its own tools to inspect its memory, crons, logs, and settings — then report findings with scores and action items.
              </p>
              <button onClick={() => runAnalysis(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                <Sparkles size={15} /> Start Self-Analysis
              </button>
            </div>
          )}

          {(status === 'running' || status === 'done' || status === 'error') && (
            <div>
              {status === 'running' && !output && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                  <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Agent is analyzing…
                </div>
              )}
              <pre style={{
                fontSize: 13, lineHeight: 1.75, fontFamily: 'inherit', whiteSpace: 'pre-wrap',
                wordBreak: 'break-word', color: 'var(--text)', margin: 0,
              }}>
                {output}
                {status === 'running' && <span style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--accent)', animation: 'pulse 1s infinite', marginLeft: 2, verticalAlign: 'middle', borderRadius: 2 }} />}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        {status === 'done' && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
            <button onClick={() => runAnalysis(false)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
              <RefreshCw size={12} /> Run Again
            </button>
            {mode === 'analysis' && (
              <button
                onClick={() => runAnalysis(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                <SendHorizonal size={13} /> Take Actions from Report
              </button>
            )}
            <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function OptimizePanel({ instance }: { instance: OpenClawInstance }) {
  const [analyses, setAnalyses] = useState<Record<AnalysisKey, AnalysisState>>({
    cost: { status: 'idle' }, crons: { status: 'idle' }, memory: { status: 'idle' },
    logs: { status: 'idle' }, security: { status: 'idle' }, skills: { status: 'idle' },
  })
  const [showAgent, setShowAgent] = useState(false)
  const [runningAll, setRunningAll] = useState(false)
  const [actionTarget, setActionTarget] = useState<Finding | null>(null)

  const wp = instance.workspacePath

  const runAnalyzer = useCallback(async (key: AnalysisKey) => {
    setAnalyses(prev => ({ ...prev, [key]: { status: 'running' } }))
    try {
      let result: AnalysisResult
      if (key === 'cost')     result = await analyzeCost(instance.id, wp)
      else if (key === 'crons')    result = await analyzeCrons(instance.id, wp)
      else if (key === 'memory')   result = await analyzeMemory(instance.id, wp)
      else if (key === 'logs')     result = await analyzeLogs(instance.id, wp)
      else if (key === 'security') result = await analyzeSecurity(instance.id, wp)
      else                         result = await analyzeSkills(instance.id, wp)

      setAnalyses(prev => ({ ...prev, [key]: { status: 'done', result, ranAt: new Date().toLocaleTimeString() } }))
    } catch (e) {
      setAnalyses(prev => ({ ...prev, [key]: { status: 'error', error: e instanceof Error ? e.message : String(e) } }))
    }
  }, [instance.id, wp])

  async function runAll() {
    setRunningAll(true)
    const keys: AnalysisKey[] = ['cost', 'crons', 'memory', 'logs', 'security', 'skills']
    await Promise.allSettled(keys.map(k => runAnalyzer(k)))
    setRunningAll(false)
  }

  // Overall score
  const completed = Object.values(analyses).filter(a => a.status === 'done' && a.result)
  const overallScore = completed.length > 0
    ? Math.round(completed.reduce((s, a) => s + (a.result?.score ?? 0), 0) / completed.length)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 12, flexWrap: 'wrap', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {overallScore !== null && <ScoreRing score={overallScore} size={52} />}
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Sparkles size={16} style={{ color: 'var(--accent)' }} /> Self-Improve
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
              {instance.name} · Analyze, score, and optimize every aspect of this agent
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowAgent(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(59,130,246,0.3)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Bot size={14} /> Ask Agent to Self-Analyze
          </button>
          <button
            onClick={runAll}
            disabled={runningAll}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: runningAll ? 'not-allowed' : 'pointer', opacity: runningAll ? 0.7 : 1 }}
          >
            {runningAll ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
            {runningAll ? 'Analyzing…' : 'Run Full Audit'}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
          {(Object.keys(MODULE_META) as AnalysisKey[]).map(key => (
            <ModuleCard
              key={key}
              moduleKey={key}
              state={analyses[key]}
              onRun={() => runAnalyzer(key)}
              onAskAgent={f => setActionTarget(f)}
            />
          ))}
        </div>

        {/* Quick actions */}
        {completed.length === Object.keys(MODULE_META).length && (
          <div style={{ marginTop: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <ArrowRight size={13} style={{ color: 'var(--accent)' }} /> Top actions from this audit
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.values(analyses)
                .flatMap(a => a.result?.findings ?? [])
                .filter(f => f.action && (f.severity === 'critical' || f.severity === 'high'))
                .slice(0, 5)
                .map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: SEV[f.severity].bg, color: SEV[f.severity].color, flexShrink: 0, marginTop: 1 }}>
                      {f.severity.toUpperCase()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>{f.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>{f.action}</div>
                    </div>
                    <button
                      onClick={() => setActionTarget(f)}
                      title="Ask agent to take this action"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(59,130,246,0.3)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 11, fontWeight: 500, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      <Bot size={11} /> Fix
                    </button>
                  </div>
                ))
              }
              {Object.values(analyses).flatMap(a => a.result?.findings ?? []).filter(f => f.action && (f.severity === 'critical' || f.severity === 'high')).length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--success)' }}>
                  <CheckCircle size={14} /> No critical actions required — system is healthy!
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showAgent && <AgentAnalysisPanel instance={instance} onClose={() => setShowAgent(false)} />}
      {actionTarget && <ActionModal instance={instance} finding={actionTarget} onClose={() => setActionTarget(null)} />}
    </div>
  )
}
