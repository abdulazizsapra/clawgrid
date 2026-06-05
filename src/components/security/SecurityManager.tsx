'use client'
import { sshExec } from '@/lib/utils'
import { useState, useEffect, useCallback } from 'react'
import {
  Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw,
  Plus, Trash2, Lock, Unlock, Eye, EyeOff, Terminal, X, ChevronDown, ChevronUp
} from 'lucide-react'
import type { OpenClawInstance } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'pass'
type Tab = 'scanner' | 'approvals' | 'guardrails'

interface Risk {
  id: string
  severity: Severity
  title: string
  detail: string
  fix?: string
  agent?: string
}

interface AllowEntry {
  id: string
  pattern: string
  lastUsedCommand?: string
  lastUsedAt?: number
  lastResolvedPath?: string
}

interface AgentSecurity {
  security: 'full' | 'standard' | 'permissive' | 'off'
  ask: 'on' | 'off' | 'always'
  askFallback: 'full' | 'standard' | 'permissive' | 'off'
  autoAllowSkills: boolean
  allowlist: AllowEntry[]
  blocklist: AllowEntry[]
}

interface ExecApprovals {
  version: number
  defaults: AgentSecurity
  agents: Record<string, AgentSecurity>
}


// ─── Severity config ──────────────────────────────────────────────────────────

const SEV: Record<Severity, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', label: 'Critical' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)', label: 'High' },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', label: 'Medium' },
  low:      { color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', label: 'Low' },
  pass:     { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', label: 'Pass' },
}

function SevBadge({ sev }: { sev: Severity }) {
  const s = SEV[sev]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}`, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
      {s.label}
    </span>
  )
}

// ─── Risk scanner ─────────────────────────────────────────────────────────────

function scanRisks(approvals: ExecApprovals | null, gatewayAuthMode: string): Risk[] {
  const risks: Risk[] = []

  // Gateway auth
  if (gatewayAuthMode !== 'token') {
    risks.push({ id: 'gw-auth', severity: 'critical', title: 'Gateway has no authentication', detail: 'The OpenClaw gateway is accepting requests without a bearer token. Any process on the VM can chat with your agent.', fix: 'Set gateway.auth.mode = "token" in openclaw.json and restart the gateway.' })
  } else {
    risks.push({ id: 'gw-auth-ok', severity: 'pass', title: 'Gateway authentication enabled', detail: 'Bearer token authentication is active on the gateway.' })
  }

  if (!approvals) return risks

  const { defaults, agents } = approvals
  const allAgents = Object.entries(agents)

  // Check each agent
  for (const [agentId, cfg] of allAgents) {
    const label = `Agent: ${agentId}`

    // Ask mode off = no human-in-the-loop for dangerous commands
    if (cfg.ask === 'off') {
      risks.push({
        id: `ask-off-${agentId}`, severity: 'high', agent: agentId,
        title: `${label}: Exec approval is disabled`,
        detail: `The agent auto-approves all commands without prompting. If it runs a destructive shell command, there's no confirmation step.`,
        fix: `Set ask = "on" for agent "${agentId}" to require approval for unlisted commands.`,
      })
    }

    // autoAllowSkills = trust any new skill without review
    if (cfg.autoAllowSkills) {
      risks.push({
        id: `auto-skills-${agentId}`, severity: 'high', agent: agentId,
        title: `${label}: Auto-allowing new skills`,
        detail: `Any newly installed skill is automatically trusted to run commands without review.`,
        fix: `Disable autoAllowSkills for agent "${agentId}".`,
      })
    }

    // Empty blocklist with permissive mode
    if (cfg.security !== 'full' && cfg.blocklist.length === 0) {
      risks.push({
        id: `no-block-${agentId}`, severity: 'medium', agent: agentId,
        title: `${label}: No blocklist with non-full security`,
        detail: `Agent is running in "${cfg.security}" security mode with no explicitly blocked commands. Consider adding blocklist entries for rm -rf, curl, wget, etc.`,
        fix: `Add blocklist entries for dangerous commands or set security = "full".`,
      })
    }

    // Wildcard or broad patterns in allowlist
    const broadPatterns = cfg.allowlist.filter(a =>
      a.pattern === '*' || a.pattern === '/**' || a.pattern.endsWith('/*')
    )
    if (broadPatterns.length > 0) {
      risks.push({
        id: `broad-allow-${agentId}`, severity: 'critical', agent: agentId,
        title: `${label}: Wildcard command allowlist detected`,
        detail: `Pattern "${broadPatterns[0].pattern}" allows execution of any command. This removes all exec guardrails.`,
        fix: `Replace wildcard patterns with specific executable paths.`,
      })
    }

    // Security level checks
    if (cfg.security === 'off') {
      risks.push({
        id: `sec-off-${agentId}`, severity: 'critical', agent: agentId,
        title: `${label}: Security mode is OFF`,
        detail: `All exec restrictions are disabled. The agent can run any command without any guardrails.`,
        fix: `Set security to "full" or "standard" immediately.`,
      })
    } else if (cfg.security === 'permissive') {
      risks.push({
        id: `sec-perm-${agentId}`, severity: 'medium', agent: agentId,
        title: `${label}: Permissive security mode`,
        detail: `Permissive mode allows commands not on the allowlist to run without blocking. This bypasses your allowlist intent.`,
        fix: `Consider upgrading to "full" or "standard" security mode.`,
      })
    } else {
      risks.push({ id: `sec-ok-${agentId}`, severity: 'pass', title: `Agent ${agentId}: Security mode is "${cfg.security}"`, detail: `Exec security policy is active.` })
    }

    // Large allowlist (many approved commands = large attack surface)
    if (cfg.allowlist.length > 20) {
      risks.push({
        id: `large-allow-${agentId}`, severity: 'low', agent: agentId,
        title: `${label}: Large allowlist (${cfg.allowlist.length} entries)`,
        detail: `A large allowlist increases attack surface. Review entries for commands that are no longer needed.`,
        fix: `Audit and prune the allowlist, removing entries not used in the last 30 days.`,
      })
    }
  }

  // Default security check
  if (defaults.security === 'off' || defaults.security === 'permissive') {
    risks.push({
      id: 'defaults-weak', severity: 'high',
      title: 'Default security policy is weak',
      detail: `Default security is "${defaults.security}" — new agents inherit this permissive baseline.`,
      fix: 'Set defaults.security = "full" in exec-approvals.json.',
    })
  }

  return risks
}

// ─── Guardrail form ───────────────────────────────────────────────────────────

function GuardrailPanel({
  agentId, cfg, onSave, saving,
}: {
  agentId: string
  cfg: AgentSecurity
  onSave: (agentId: string, patch: Partial<AgentSecurity>) => void
  saving: boolean
}) {
  const [local, setLocal] = useState(cfg)
  const [newBlock, setNewBlock] = useState('')

  const sel: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%' }

  function addBlocklist() {
    const p = newBlock.trim()
    if (!p) return
    const entry: AllowEntry = { id: crypto.randomUUID(), pattern: p }
    setLocal(prev => ({ ...prev, blocklist: [...prev.blocklist, entry] }))
    setNewBlock('')
  }

  function removeBlocklist(id: string) {
    setLocal(prev => ({ ...prev, blocklist: prev.blocklist.filter(b => b.id !== id) }))
  }

  function removeAllowlist(id: string) {
    setLocal(prev => ({ ...prev, allowlist: prev.allowlist.filter(a => a.id !== id) }))
  }

  const isDirty = JSON.stringify(local) !== JSON.stringify(cfg)

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Agent: <code style={{ fontSize: 13, color: 'var(--accent)' }}>{agentId}</code></span>
        </div>
        {isDirty && (
          <button onClick={() => onSave(agentId, local)} disabled={saving}
            style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Security Level</label>
          <select style={sel} value={local.security} onChange={e => setLocal(p => ({ ...p, security: e.target.value as AgentSecurity['security'] }))}>
            <option value="full">full — strict allowlist enforcement</option>
            <option value="standard">standard — allowlist with fallback</option>
            <option value="permissive">permissive — warn only</option>
            <option value="off">off — no restrictions ⚠</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Ask Mode</label>
          <select style={sel} value={local.ask} onChange={e => setLocal(p => ({ ...p, ask: e.target.value as AgentSecurity['ask'] }))}>
            <option value="off">off — auto-approve allowlisted</option>
            <option value="on">on — ask for unknown commands</option>
            <option value="always">always — ask for every command</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 }}>
          <input type="checkbox" id={`auto-${agentId}`} checked={local.autoAllowSkills}
            onChange={e => setLocal(p => ({ ...p, autoAllowSkills: e.target.checked }))}
            style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
          <label htmlFor={`auto-${agentId}`} style={{ fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
            Auto-allow new skills <span style={{ color: 'var(--error)', fontSize: 10 }}>⚠ risky</span>
          </label>
        </div>
      </div>

      {/* Blocklist */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>
          Blocklist ({local.blocklist.length} entries) — commands the agent is never allowed to run
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={newBlock} onChange={e => setNewBlock(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addBlocklist()}
            placeholder="e.g. /bin/rm or rm -rf or curl"
            style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: 'var(--text)', outline: 'none', fontFamily: "'SF Mono','Fira Code',monospace" }}
          />
          <button onClick={addBlocklist} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: 'var(--error)', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={11} /> Block
          </button>
        </div>
        {local.blocklist.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>No blocked commands. Consider blocking: rm -rf, curl, wget, nc, ncat</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {local.blocklist.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <XCircle size={11} style={{ color: 'var(--error)', flexShrink: 0 }} />
              <code style={{ flex: 1, fontSize: 12, color: 'var(--error)', fontFamily: "'SF Mono','Fira Code',monospace" }}>{b.pattern}</code>
              <button onClick={() => removeBlocklist(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2 }}><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Allowlist */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>
          Allowlist ({local.allowlist.length} entries) — approved executables
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {local.allowlist.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', borderRadius: 6, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
              <CheckCircle size={11} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <code style={{ fontSize: 12, color: 'var(--success)', fontFamily: "'SF Mono','Fira Code',monospace", wordBreak: 'break-all' }}>{a.pattern}</code>
                {a.lastUsedCommand && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.lastUsedCommand}>
                    Last: {a.lastUsedCommand}
                  </div>
                )}
              </div>
              <button onClick={() => removeAllowlist(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2, flexShrink: 0 }}><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function SecurityManager({ instance }: { instance: OpenClawInstance }) {
  const [tab, setTab] = useState<Tab>('scanner')
  const [approvals, setApprovals] = useState<ExecApprovals | null>(null)
  const [gatewayAuthMode, setGatewayAuthMode] = useState<string>('unknown')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [expandedRisks, setExpandedRisks] = useState<Set<string>>(new Set())

  const wp = instance.workspacePath

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const out = await sshExec(instance.id, `python3 << 'PYEOF'
import json, os
wp = "${wp}"
result = {}

try:
    result['approvals'] = json.load(open(wp+'/exec-approvals.json'))
except Exception as e:
    result['approvals_err'] = str(e)

try:
    cfg = json.load(open(wp+'/openclaw.json'))
    result['gatewayAuthMode'] = cfg.get('gateway', {}).get('auth', {}).get('mode', 'none')
except:
    result['gatewayAuthMode'] = 'unknown'

print(json.dumps(result))
PYEOF`)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: Record<string, any> = {}
      try { data = JSON.parse(out.trim() || '{}') } catch { /* use default */ }
      if (data.approvals) setApprovals(data.approvals as ExecApprovals)
      if (data.gatewayAuthMode) setGatewayAuthMode(String(data.gatewayAuthMode))
      setLastScan(new Date().toLocaleTimeString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load security data')
    } finally {
      setLoading(false)
    }
  }, [instance.id, wp])

  useEffect(() => { load().catch(() => {}) }, [load])

  async function saveGuardrails(agentId: string, patch: Partial<AgentSecurity>) {
    setSaving(true)
    try {
      const updated = { ...approvals! }
      updated.agents = {
        ...updated.agents,
        [agentId]: { ...updated.agents[agentId], ...patch },
      }
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(updated))))
      await sshExec(instance.id, `python3 -c "
import base64, json
data = json.loads(base64.b64decode('${b64}').decode())
with open('${wp}/exec-approvals.json', 'w') as f:
    json.dump(data, f, indent=2)
print('ok')
"`)
      setApprovals(updated)
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const risks = scanRisks(approvals, gatewayAuthMode)
  const critical = risks.filter(r => r.severity === 'critical').length
  const high = risks.filter(r => r.severity === 'high').length
  const medium = risks.filter(r => r.severity === 'medium').length
  const passes = risks.filter(r => r.severity === 'pass').length
  const totalIssues = critical + high + medium

  const overallStatus = critical > 0 ? 'critical' : high > 0 ? 'high' : medium > 0 ? 'medium' : 'pass'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={16} style={{ color: overallStatus === 'pass' ? 'var(--success)' : overallStatus === 'medium' ? 'var(--warning)' : 'var(--error)' }} />
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Security</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              {instance.name}
              {lastScan && <span style={{ color: 'var(--text-dim)' }}> · scanned {lastScan}</span>}
            </p>
          </div>
        </div>

        {/* Overall status pill */}
        {!loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {totalIssues === 0 ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--success)', background: 'rgba(34,197,94,0.1)', padding: '5px 14px', borderRadius: 20 }}>
                <CheckCircle size={13} /> All checks passed
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: SEV[overallStatus].color, background: SEV[overallStatus].bg, padding: '5px 14px', borderRadius: 20, border: `1px solid ${SEV[overallStatus].border}` }}>
                <AlertTriangle size={13} /> {totalIssues} issue{totalIssues !== 1 ? 's' : ''} found
              </span>
            )}
            <button onClick={() => load().catch(() => {})} disabled={loading} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Rescan
            </button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
        {([
          { key: 'scanner' as Tab, label: 'Risk Scanner', badge: totalIssues > 0 ? String(totalIssues) : null, badgeColor: SEV[overallStatus].color },
          { key: 'approvals' as Tab, label: 'Exec Approvals', badge: approvals ? String(Object.values(approvals.agents).reduce((s, a) => s + a.allowlist.length, 0)) : null, badgeColor: 'var(--text-dim)' },
          { key: 'guardrails' as Tab, label: 'Guardrails', badge: null, badgeColor: '' },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 18px', fontSize: 13, fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer',
            border: 'none', background: 'transparent',
            color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: t.badgeColor, color: '#fff', opacity: 0.9 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {error && <div style={{ padding: '8px 20px', fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', flexShrink: 0 }}>{error}</div>}

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>

        {/* ── Risk Scanner ── */}
        {tab === 'scanner' && (
          <div>
            {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Scanning…</div>}

            {!loading && (
              <>
                {/* Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 22 }}>
                  {[
                    { label: 'Critical', count: critical, sev: 'critical' as Severity },
                    { label: 'High', count: high, sev: 'high' as Severity },
                    { label: 'Medium', count: medium, sev: 'medium' as Severity },
                    { label: 'Passed', count: passes, sev: 'pass' as Severity },
                  ].map(s => (
                    <div key={s.label} style={{ background: SEV[s.sev].bg, border: `1px solid ${SEV[s.sev].border}`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: SEV[s.sev].color }}>{s.count}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Risk list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(['critical', 'high', 'medium', 'low', 'pass'] as Severity[]).map(sev =>
                    risks.filter(r => r.severity === sev).map(risk => {
                      const expanded = expandedRisks.has(risk.id)
                      const s = SEV[sev]
                      return (
                        <div key={risk.id} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, overflow: 'hidden' }}>
                          <button
                            onClick={() => setExpandedRisks(prev => { const n = new Set(prev); n.has(risk.id) ? n.delete(risk.id) : n.add(risk.id); return n })}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          >
                            {sev === 'pass' ? <CheckCircle size={14} style={{ color: s.color, flexShrink: 0 }} /> : <AlertTriangle size={14} style={{ color: s.color, flexShrink: 0 }} />}
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{risk.title}</span>
                            <SevBadge sev={sev} />
                            {expanded ? <ChevronUp size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }} /> : <ChevronDown size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />}
                          </button>
                          {expanded && (
                            <div style={{ padding: '0 14px 12px 38px' }}>
                              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.6 }}>{risk.detail}</p>
                              {risk.fix && (
                                <div style={{ display: 'flex', gap: 7, fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)', borderRadius: 7, padding: '7px 10px', alignItems: 'flex-start' }}>
                                  <span style={{ flexShrink: 0, fontWeight: 700 }}>Fix:</span>
                                  <span>{risk.fix}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Exec Approvals ── */}
        {tab === 'approvals' && (
          <div>
            {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && !approvals && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No exec-approvals.json found</div>}
            {approvals && (
              <>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 18 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Default Policy</p>
                  <div style={{ display: 'flex', gap: 20, fontSize: 12, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Security', value: approvals.defaults.security },
                      { label: 'Ask', value: approvals.defaults.ask },
                      { label: 'Auto-allow skills', value: String(approvals.defaults.autoAllowSkills) },
                    ].map(r => (
                      <div key={r.label}>
                        <span style={{ color: 'var(--text-dim)' }}>{r.label}: </span>
                        <code style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{r.value}</code>
                      </div>
                    ))}
                  </div>
                </div>

                {Object.entries(approvals.agents).map(([agentId, cfg]) => (
                  <div key={agentId} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Terminal size={13} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>Agent: <code style={{ color: 'var(--accent)', fontSize: 13 }}>{agentId}</code></span>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: cfg.security === 'full' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', color: cfg.security === 'full' ? 'var(--success)' : 'var(--warning)' }}>
                        {cfg.security}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>ask: {cfg.ask}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                      <span>{cfg.allowlist.length} allowed commands</span>
                      <span>{cfg.blocklist.length} blocked commands</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {cfg.allowlist.slice(0, 10).map(a => (
                        <div key={a.id} style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'flex-start', padding: '5px 8px', borderRadius: 5, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)' }}>
                          <CheckCircle size={10} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }} />
                          <div style={{ minWidth: 0 }}>
                            <code style={{ color: 'var(--success)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{a.pattern}</code>
                            {a.lastUsedAt && <div style={{ color: 'var(--text-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Last used: {new Date(a.lastUsedAt).toLocaleDateString()}</div>}
                          </div>
                        </div>
                      ))}
                      {cfg.allowlist.length > 10 && <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '3px 8px' }}>+{cfg.allowlist.length - 10} more…</div>}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Guardrails ── */}
        {tab === 'guardrails' && (
          <div>
            <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--accent)' }}>Guardrails</strong> control what shell commands each agent is allowed or forbidden to run. Changes are written to <code style={{ fontSize: 12 }}>exec-approvals.json</code> and take effect immediately — no gateway restart required.
            </div>

            {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && !approvals && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No exec-approvals.json found</div>}
            {approvals && Object.entries(approvals.agents).map(([agentId, cfg]) => (
              <GuardrailPanel
                key={agentId}
                agentId={agentId}
                cfg={cfg}
                onSave={saveGuardrails}
                saving={saving}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
