'use client'
import { sshExec } from '@/lib/utils'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  RefreshCw, Activity, Cpu, HardDrive, MemoryStick,
  ArrowUpCircle, CheckCircle, AlertTriangle, XCircle,
  Play, Square, Terminal, Wifi, WifiOff, Clock
} from 'lucide-react'
import type { OpenClawInstance } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthData {
  gatewayOnline: boolean
  gatewayVersion: string
  installedVersion: string | null
  latestVersion: string | null
  updateCheckedAt: string | null
  gatewayPid: string | null
  memTotalMb: number
  memUsedMb: number
  loadAvg: [string, string, string]
  diskTotal: string
  diskUsed: string
  diskPct: string
  uptime: string
  checkedAt: number
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  try {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString()
  } catch { return iso }
}

function semverNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [aMaj, aMin, aPatch] = parse(a)
  const [bMaj, bMin, bPatch] = parse(b)
  if (bMaj !== aMaj) return bMaj > aMaj
  if (bMin !== aMin) return bMin > aMin
  return (bPatch ?? 0) > (aPatch ?? 0)
}

// ─── Stat ring ────────────────────────────────────────────────────────────────

function StatRing({ pct, color, label, sub }: { pct: number; color: string; label: string; sub: string }) {
  const r = 30
  const circ = 2 * Math.PI * r
  const dash = circ * Math.min(pct / 100, 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface3)" strokeWidth="7" />
          <circle
            cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{Math.round(pct)}%</span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sub}</div>
      </div>
    </div>
  )
}

// ─── Update modal ─────────────────────────────────────────────────────────────

function UpdateModal({
  instance, current, latest, onClose, onDone,
}: {
  instance: OpenClawInstance
  current: string
  latest: string
  onClose: () => void
  onDone: () => void
}) {
  const [status, setStatus] = useState<'confirm' | 'updating' | 'done' | 'error'>('confirm')
  const [log, setLog] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  async function runUpdate() {
    setStatus('updating')
    setLog(['Starting update…'])

    try {
      // Find npm binary path
      const npmPath = '/home/openclaw/.nvm/versions/node/v22.22.2/bin/npm'
      setLog(prev => [...prev, `Using: ${npmPath} install -g openclaw@latest`])

      const out = await sshExec(instance.id,
        `${npmPath} install -g openclaw@latest 2>&1 && echo "UPDATE_OK" || echo "UPDATE_FAILED"`
      )

      const lines = out.trim().split('\n').filter(Boolean)
      setLog(prev => [...prev, ...lines])

      if (out.includes('UPDATE_OK')) {
        setLog(prev => [...prev, '', '✓ Update complete! Restart the gateway to use the new version.'])
        setStatus('done')
      } else {
        setStatus('error')
      }
    } catch (e) {
      setLog(prev => [...prev, `Error: ${e instanceof Error ? e.message : String(e)}`])
      setStatus('error')
    }

    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={status === 'confirm' ? onClose : undefined}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 520, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ArrowUpCircle size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Update OpenClaw</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{instance.name} · {current} → {latest}</div>
          </div>
        </div>

        {status === 'confirm' && (
          <div style={{ padding: 20 }}>
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--warning)' }}>
              ⚠ This will update the OpenClaw installation on <strong>{instance.name}</strong>. The gateway will need to be restarted afterwards.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={runUpdate} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Update to {latest}
              </button>
            </div>
          </div>
        )}

        {(status === 'updating' || status === 'done' || status === 'error') && (
          <div style={{ padding: 20 }}>
            <div ref={logRef} style={{ background: '#0d1117', borderRadius: 8, padding: '12px 14px', height: 200, overflow: 'auto', fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 12, lineHeight: 1.7, color: '#e8eaf0', marginBottom: 14 }}>
              {log.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('✓') ? 'var(--success)' : line.startsWith('Error') ? 'var(--error)' : '#e8eaf0' }}>{line}</div>
              ))}
              {status === 'updating' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', marginTop: 4 }}>
                  <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> Running…
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {status === 'done' && (
                <button onClick={onDone} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--success)', color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
              )}
              {status === 'error' && (
                <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>Close</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const POLL_INTERVAL = 30_000

export function HealthMonitor({ instance }: { instance: OpenClawInstance }) {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [restarting, setRestarting] = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)
  const [gatewayStatus, setGatewayStatus] = useState<'online' | 'offline' | 'checking'>('checking')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch gateway health via the gateway API (not SSH)
  async function checkGatewayOnline(): Promise<boolean> {
    try {
      const res = await fetch(`/api/gateway/${instance.id}/health`, { cache: 'no-store' })
      const d = await res.json()
      return d.status === 'online'
    } catch {
      return false
    }
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Run health collection Python script + gateway check in parallel
      const [rawOut, online] = await Promise.all([
        sshExec(instance.id, `python3 << 'PYEOF'
import json, subprocess, os

# Update check
upd = {}
try: upd = json.load(open('/home/openclaw/.openclaw/update-check.json'))
except: pass

# Installed version
installed = None
try: installed = json.load(open('/home/openclaw/.nvm/versions/node/v22.22.2/lib/node_modules/openclaw/package.json')).get('version')
except: pass

# Gateway PID
pid = None
try: pid = open('/home/openclaw/.openclaw/gateway.pid').read().strip()
except: pass

# Memory
mem = subprocess.run(['free','-m'], capture_output=True, text=True).stdout
mem_line = [l for l in mem.splitlines() if l.startswith('Mem:')]
mem_total = mem_used = 0
if mem_line:
    parts = mem_line[0].split()
    mem_total = int(parts[1]); mem_used = int(parts[2])

# CPU load
load = open('/proc/loadavg').read().split()[:3]

# Disk
df_out = subprocess.run(['df','-h','/'], capture_output=True, text=True).stdout.splitlines()
df = df_out[-1].split() if len(df_out) > 1 else []

# Uptime
uptime = subprocess.run(['uptime','-p'], capture_output=True, text=True).stdout.strip()

print(json.dumps({
    'installedVersion': installed,
    'latestVersion': upd.get('lastAvailableVersion'),
    'updateCheckedAt': upd.get('lastCheckedAt'),
    'gatewayPid': pid,
    'memTotalMb': mem_total,
    'memUsedMb': mem_used,
    'loadAvg': load,
    'diskTotal': df[1] if len(df) > 1 else '?',
    'diskUsed': df[2] if len(df) > 2 else '?',
    'diskPct': df[4] if len(df) > 4 else '?',
    'uptime': uptime,
}))
PYEOF`),
        checkGatewayOnline(),
      ])

      const parsed = JSON.parse(rawOut.trim() || '{}')
      setHealth({
        ...parsed,
        gatewayOnline: online,
        gatewayVersion: instance.version ?? parsed.installedVersion ?? '?',
        checkedAt: Date.now(),
      })
      setGatewayStatus(online ? 'online' : 'offline')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load health data')
    } finally {
      setLoading(false)
    }
  }, [instance.id, instance.version])

  useEffect(() => {
    load().catch(() => {})
    if (autoRefresh) {
      intervalRef.current = setInterval(() => load().catch(() => {}), POLL_INTERVAL)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load, autoRefresh])

  async function restartGateway() {
    setRestarting(true)
    setGatewayStatus('checking')
    try {
      await sshExec(instance.id,
        'pkill -f "openclaw.*gateway" 2>/dev/null; sleep 2; ' +
        'cd /home/openclaw && nohup /home/openclaw/.nvm/versions/node/v22.22.2/bin/node ' +
        '/home/openclaw/.nvm/versions/node/v22.22.2/lib/node_modules/openclaw/dist/cli.js ' +
        'gateway --port 18789 >> ~/.openclaw/gateway.log 2>&1 &'
      )
      // Wait a moment then recheck
      await new Promise(r => setTimeout(r, 3000))
      await load()
    } catch (e) {
      setError(`Restart failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRestarting(false)
    }
  }

  const updateAvailable = health?.installedVersion && health?.latestVersion
    ? semverNewer(health.installedVersion, health.latestVersion)
    : false

  const memPct = health ? (health.memUsedMb / health.memTotalMb) * 100 : 0
  const cpuLoad = health ? parseFloat(health.loadAvg[0]) : 0
  const diskPct = health ? parseInt(health.diskPct) || 0 : 0

  // Color thresholds
  const memColor = memPct > 85 ? 'var(--error)' : memPct > 65 ? 'var(--warning)' : 'var(--success)'
  const cpuColor = cpuLoad > 3 ? 'var(--error)' : cpuLoad > 1.5 ? 'var(--warning)' : 'var(--success)'
  const diskColor = diskPct > 85 ? 'var(--error)' : diskPct > 65 ? 'var(--warning)' : 'var(--success)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={16} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Health Monitor</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              {instance.name}
              {health?.checkedAt && <span style={{ color: 'var(--text-dim)' }}> · checked {fmtTime(new Date(health.checkedAt).toISOString())}</span>}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(r => !r)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
              borderRadius: 7, border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer',
              background: autoRefresh ? 'var(--accent-dim)' : 'var(--surface2)',
              color: autoRefresh ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <Clock size={11} />
            {autoRefresh ? 'Auto (30s)' : 'Manual'}
          </button>

          <button onClick={() => load().catch(() => {})} disabled={loading} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '8px 20px', fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', flexShrink: 0 }}>{error}</div>}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Gateway status + update banner */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Gateway status card */}
          <div style={{ background: 'var(--surface2)', border: `1px solid ${gatewayStatus === 'online' ? 'rgba(34,197,94,0.3)' : gatewayStatus === 'offline' ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {gatewayStatus === 'online'
                  ? <Wifi size={16} style={{ color: 'var(--success)' }} />
                  : gatewayStatus === 'offline'
                    ? <WifiOff size={16} style={{ color: 'var(--error)' }} />
                    : <RefreshCw size={16} style={{ color: 'var(--text-dim)', animation: 'spin 1s linear infinite' }} />
                }
                <span style={{ fontWeight: 600, fontSize: 14 }}>Gateway</span>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                background: gatewayStatus === 'online' ? 'rgba(34,197,94,0.15)' : gatewayStatus === 'offline' ? 'rgba(239,68,68,0.15)' : 'var(--surface3)',
                color: gatewayStatus === 'online' ? 'var(--success)' : gatewayStatus === 'offline' ? 'var(--error)' : 'var(--text-dim)',
              }}>
                {gatewayStatus === 'checking' ? 'checking…' : gatewayStatus}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'URL', value: instance.gatewayUrl },
                { label: 'PID', value: health?.gatewayPid ?? '—' },
                { label: 'Uptime', value: health?.uptime ?? '—' },
                { label: 'Version', value: health?.installedVersion ?? '—' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-dim)', width: 56, flexShrink: 0 }}>{r.label}</span>
                  <span style={{ color: 'var(--text)', fontFamily: r.label === 'URL' || r.label === 'PID' ? 'monospace' : 'inherit', fontSize: r.label === 'URL' ? 11 : 12 }}>{r.value}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button
                onClick={restartGateway}
                disabled={restarting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, fontSize: 12,
                  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: restarting ? 'not-allowed' : 'pointer',
                  opacity: restarting ? 0.6 : 1,
                }}
              >
                {restarting ? <><RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> Restarting…</> : <><Square size={11} /><Play size={11} /> Restart</>}
              </button>
              <a href={`/instances/${instance.id}/logs`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, fontSize: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', textDecoration: 'none' }}>
                <Terminal size={11} /> Logs
              </a>
            </div>
          </div>

          {/* Update status card */}
          <div style={{
            background: 'var(--surface2)',
            border: `1px solid ${updateAvailable ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
            borderRadius: 12, padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ArrowUpCircle size={16} style={{ color: updateAvailable ? 'var(--accent)' : 'var(--text-dim)' }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Updates</span>
              </div>
              {updateAvailable
                ? <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent)' }}>Update available</span>
                : <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>Up to date</span>
              }
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {[
                { label: 'Installed', value: health?.installedVersion ?? '—', highlight: updateAvailable },
                { label: 'Latest', value: health?.latestVersion ?? '—', highlight: false },
                { label: 'Checked', value: health?.updateCheckedAt ? fmtTime(health.updateCheckedAt) : '—', highlight: false },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-dim)', width: 56, flexShrink: 0 }}>{r.label}</span>
                  <span style={{
                    color: r.label === 'Installed' && updateAvailable ? 'var(--warning)'
                      : r.label === 'Latest' ? 'var(--success)' : 'var(--text)',
                    fontFamily: 'monospace',
                  }}>
                    {r.value}
                  </span>
                </div>
              ))}
            </div>

            {updateAvailable && health && (
              <button
                onClick={() => setShowUpdate(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                }}
              >
                <ArrowUpCircle size={13} /> Update to {health.latestVersion}
              </button>
            )}
            {!updateAvailable && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle size={12} style={{ color: 'var(--success)' }} /> Running latest version
              </div>
            )}
          </div>
        </div>

        {/* System metrics */}
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 20px' }}>System Metrics</p>
          {loading && !health ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
          ) : health ? (
            <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'space-around' }}>
              <StatRing
                pct={memPct}
                color={memColor}
                label="Memory"
                sub={`${health.memUsedMb}MB / ${health.memTotalMb}MB`}
              />
              <StatRing
                pct={Math.min((cpuLoad / 4) * 100, 100)}
                color={cpuColor}
                label="CPU Load"
                sub={`${health.loadAvg.join(' · ')}`}
              />
              <StatRing
                pct={diskPct}
                color={diskColor}
                label="Disk"
                sub={`${health.diskUsed} / ${health.diskTotal}`}
              />
            </div>
          ) : null}
        </div>

        {/* Gateway health history - simple status bar */}
        <HealthHistory instanceId={instance.id} gatewayUrl={instance.gatewayUrl} token={instance.token} />
      </div>

      {/* Update modal */}
      {showUpdate && health?.installedVersion && health?.latestVersion && (
        <UpdateModal
          instance={instance}
          current={health.installedVersion}
          latest={health.latestVersion}
          onClose={() => setShowUpdate(false)}
          onDone={() => { setShowUpdate(false); load().catch(() => {}) }}
        />
      )}
    </div>
  )
}

// ─── Health history (last N checks as status dots) ────────────────────────────

function HealthHistory({ instanceId, gatewayUrl, token }: { instanceId: string; gatewayUrl: string; token: string }) {
  const [history, setHistory] = useState<Array<{ ts: number; online: boolean }>>([])
  const maxHistory = 20

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`/api/gateway/${instanceId}/health`, { cache: 'no-store' })
        const d = await res.json()
        const online = d.status === 'online'
        setHistory(prev => [...prev.slice(-(maxHistory - 1)), { ts: Date.now(), online }])
      } catch {
        setHistory(prev => [...prev.slice(-(maxHistory - 1)), { ts: Date.now(), online: false }])
      }
    }

    check()
    const iv = setInterval(check, 30_000)
    return () => clearInterval(iv)
  }, [instanceId])

  if (history.length === 0) return null

  const uptimePct = Math.round((history.filter(h => h.online).length / history.length) * 100)

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Gateway Uptime (this session)</p>
        <span style={{ fontSize: 13, fontWeight: 700, color: uptimePct === 100 ? 'var(--success)' : uptimePct >= 90 ? 'var(--warning)' : 'var(--error)' }}>
          {uptimePct}%
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {Array.from({ length: maxHistory }, (_, i) => {
          const check = history[history.length - maxHistory + i]
          if (!check) return <div key={i} style={{ flex: 1, height: 24, borderRadius: 4, background: 'var(--surface3)' }} />
          return (
            <div
              key={i}
              title={`${new Date(check.ts).toLocaleTimeString()} — ${check.online ? 'online' : 'offline'}`}
              style={{ flex: 1, height: 24, borderRadius: 4, background: check.online ? 'var(--success)' : 'var(--error)', opacity: 0.8, transition: 'background 0.2s' }}
            />
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-dim)' }}>
        <span>oldest</span>
        <span>{history.length} checks · every 30s</span>
        <span>now</span>
      </div>
    </div>
  )
}
