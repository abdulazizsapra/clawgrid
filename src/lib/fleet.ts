import { runSshCommand } from './ssh'
import type { OpenClawInstance } from '@/types'

export interface InstanceKPIs {
  cronTotal: number
  cronEnabled: number
  cronErrors: number
  cronRan: number
  memFiles: number
  memChunks: number
  convAgents: number
  convMessages: number
  agentCount: number
  logSizeKb: number
  installedVersion: string | null
  latestVersion: string | null
  updateAvailable: boolean
}

const BLANK_KPIS: InstanceKPIs = {
  cronTotal: 0, cronEnabled: 0, cronErrors: 0, cronRan: 0,
  memFiles: 0, memChunks: 0, convAgents: 0, convMessages: 0,
  agentCount: 0, logSizeKb: 0,
  installedVersion: null, latestVersion: null, updateAvailable: false,
}

export async function fetchInstanceKPIs(inst: OpenClawInstance): Promise<InstanceKPIs> {
  const wp = inst.workspacePath
  const script = `python3 << 'PYEOF'
import json, os, subprocess

wp = "${wp}"

try:
    jobs = json.load(open(wp+"/cron/jobs.json")).get("jobs",[])
    state = json.load(open(wp+"/cron/jobs-state.json")).get("jobs",{})
    cron_enabled = sum(1 for j in jobs if j.get("enabled"))
    cron_ran = sum(1 for j in jobs if (state.get(j["id"],{}).get("state") or state.get(j["id"],{})).get("lastRunAtMs"))
    cron_errors = sum(1 for j in jobs if ((state.get(j["id"],{}).get("state") or state.get(j["id"],{})).get("consecutiveErrors",0) or 0) > 0)
except: jobs=[]; cron_enabled=0; cron_ran=0; cron_errors=0

try:
    import sqlite3
    conn = sqlite3.connect(wp+"/memory/main.sqlite")
    mem_files = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    mem_chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    conn.close()
except: mem_files=0; mem_chunks=0

try:
    convs = [f for f in os.listdir(wp+"/conversations") if f.endswith(".jsonl")]
    conv_msgs = sum(sum(1 for _ in open(wp+"/conversations/"+f)) for f in convs)
except: convs=[]; conv_msgs=0

try: agents = os.listdir(wp+"/agents")
except: agents=[]

try: log_kb = os.path.getsize(wp+"/gateway.log") // 1024
except: log_kb = 0

try: installed = json.load(open("/home/openclaw/.nvm/versions/node/v22.22.2/lib/node_modules/openclaw/package.json")).get("version")
except: installed = None

try: latest = json.load(open(wp+"/update-check.json")).get("lastAvailableVersion")
except: latest = None

def semver_newer(a, b):
    try:
        av = list(map(int, a.split(".")))
        bv = list(map(int, b.split(".")))
        return bv > av
    except: return False

print(json.dumps({
    "cronTotal": len(jobs), "cronEnabled": cron_enabled,
    "cronRan": cron_ran, "cronErrors": cron_errors,
    "memFiles": mem_files, "memChunks": mem_chunks,
    "convAgents": len(convs), "convMessages": conv_msgs,
    "agentCount": len(agents), "logSizeKb": log_kb,
    "installedVersion": installed, "latestVersion": latest,
    "updateAvailable": semver_newer(installed or "0", latest or "0"),
}))
PYEOF`

  try {
    const result = await runSshCommand(inst, script)
    const data = JSON.parse(result.stdout.trim() || '{}')
    return { ...BLANK_KPIS, ...data }
  } catch {
    return BLANK_KPIS
  }
}
