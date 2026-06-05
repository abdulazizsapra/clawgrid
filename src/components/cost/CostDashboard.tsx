'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Activity, CheckCircle, AlertCircle, Clock, List } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { OpenClawInstance } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CronJob {
  id: string
  name: string
  command: string
  schedule: string
  enabled: boolean
}

interface JobState {
  lastRunAtMs?: number
  lastDurationMs?: number
  consecutiveErrors?: number
  state?: JobState
}

interface JobRow {
  id: string
  name: string
  lastRunAtMs: number | null
  lastDurationMs: number | null
  consecutiveErrors: number
  enabled: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(ms: number | null): string {
  if (ms == null || ms < 0) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function fmtRelative(ms: number | null): string {
  if (ms == null) return 'never'
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

async function execSSH(instanceId: string, command: string): Promise<string> {
  const res = await fetch(`/api/ssh/${instanceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'exec', args: { command } }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return (data.stdout ?? '').trim()
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CostDashboard({ instance }: { instance: OpenClawInstance }) {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [convCount, setConvCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const wp = instance.workspacePath

      // Run three reads in parallel
      const [jobsRaw, stateRaw, convRaw] = await Promise.all([
        execSSH(instance.id, `cat "${wp}/cron/jobs.json" 2>/dev/null || echo "[]"`),
        execSSH(instance.id, `cat "${wp}/cron/jobs-state.json" 2>/dev/null || echo "{}"`),
        execSSH(instance.id, `ls "${wp}/conversations/" 2>/dev/null | wc -l`),
      ])

      let parsedJobs: CronJob[] = []
      let parsedState: Record<string, JobState> = {}

      try { const raw = JSON.parse(jobsRaw); parsedJobs = Array.isArray(raw) ? raw : (raw.jobs ?? []) } catch { parsedJobs = [] }
      try { const raw = JSON.parse(stateRaw); parsedState = raw.jobs ?? raw } catch { parsedState = {} }

      const rows: JobRow[] = parsedJobs.map((j: CronJob) => {
        const entry = parsedState[j.id] ?? {}
        // jobs-state.json nests real state under entry.state
        const st = entry.state ?? entry
        return {
          id: j.id,
          name: j.name || j.id,
          lastRunAtMs: st.lastRunAtMs ?? null,
          lastDurationMs: st.lastDurationMs ?? null,
          consecutiveErrors: st.consecutiveErrors ?? 0,
          enabled: j.enabled ?? true,
        }
      })

      setJobs(rows)
      setConvCount(parseInt(convRaw, 10) || 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity data')
    } finally {
      setLoading(false)
    }
  }, [instance.id, instance.workspacePath])

  useEffect(() => { load() }, [load])

  // ── Derived stats ────────────────────────────────────────────────────────

  const totalJobs = jobs.length
  const activeJobs = jobs.filter(j => j.enabled).length
  const jobsRun = jobs.filter(j => j.lastRunAtMs != null)
  const totalRuns = jobsRun.length // each job tracks last run, not total runs; count jobs that have run at all
  const durationsMs = jobsRun.map(j => j.lastDurationMs).filter((d): d is number => d != null)
  const avgDurationMs = durationsMs.length > 0
    ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length
    : null
  const errorJobs = jobs.filter(j => j.consecutiveErrors > 0).length
  const errorRate = totalJobs > 0 ? ((errorJobs / totalJobs) * 100).toFixed(1) : '0.0'

  // Bar chart: top 10 longest-running jobs by lastDurationMs
  const chartData = [...jobsRun]
    .filter(j => j.lastDurationMs != null)
    .sort((a, b) => (b.lastDurationMs ?? 0) - (a.lastDurationMs ?? 0))
    .slice(0, 10)
    .map(j => ({
      name: j.name.length > 16 ? j.name.slice(0, 14) + '…' : j.name,
      fullName: j.name,
      durationMs: j.lastDurationMs ?? 0,
      durationLabel: fmtDuration(j.lastDurationMs),
    }))

  // Recently-run jobs sorted by lastRunAtMs desc
  const recentJobs = [...jobsRun]
    .sort((a, b) => (b.lastRunAtMs ?? 0) - (a.lastRunAtMs ?? 0))

  const stats = [
    {
      icon: Activity,
      label: 'Jobs Run',
      value: loading ? '—' : String(totalRuns),
      sub: `of ${totalJobs} total jobs`,
      color: 'var(--accent)',
    },
    {
      icon: CheckCircle,
      label: 'Active Jobs',
      value: loading ? '—' : `${activeJobs} / ${totalJobs}`,
      sub: 'enabled vs total',
      color: 'var(--success)',
    },
    {
      icon: Clock,
      label: 'Avg Duration',
      value: loading ? '—' : fmtDuration(avgDurationMs),
      sub: 'across executed jobs',
      color: 'var(--warning)',
    },
    {
      icon: AlertCircle,
      label: 'Error Rate',
      value: loading ? '—' : `${errorRate}%`,
      sub: `${errorJobs} job(s) with errors`,
      color: parseFloat(errorRate) > 0 ? 'var(--error)' : 'var(--success)',
    },
  ]

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        background: 'var(--surface)',
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Activity Dashboard</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, marginBottom: 0 }}>
            {instance.name} · cron activity &amp; execution stats
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          title="Refresh"
          style={{
            padding: 7, borderRadius: 7, background: 'var(--surface2)',
            border: '1px solid var(--border)', color: 'var(--text-muted)',
            cursor: loading ? 'not-allowed' : 'pointer', lineHeight: 0,
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 32px' }}>

        {/* Info banner */}
        <div style={{
          fontSize: 12, color: 'var(--text-muted)',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderLeft: '3px solid var(--accent)', borderRadius: 8,
          padding: '9px 14px', marginBottom: 20,
        }}>
          <strong style={{ color: 'var(--accent)' }}>Note:</strong>{' '}
          Token cost data is not stored on-disk by OpenClaw. Activity stats shown instead.
          {convCount != null && (
            <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>
              · {convCount} conversation file{convCount !== 1 ? 's' : ''} found
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            fontSize: 13, color: 'var(--error)', background: 'color-mix(in srgb, var(--error) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {/* ── Stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 24 }}>
          {stats.map(s => (
            <div key={s.label} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <s.icon size={14} style={{ color: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Bar chart: top 10 longest jobs ── */}
        {!loading && chartData.length > 0 && (
          <div style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '18px 20px', marginBottom: 20,
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 16, marginTop: 0 }}>
              Top Jobs by Last Duration
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={28} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtDuration(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, fontSize: 12, color: 'var(--text)',
                  }}
                  formatter={(_v: number, _name: string, props: { payload?: { durationLabel?: string; fullName?: string } }) => [
                    props.payload?.durationLabel ?? fmtDuration(_v),
                    props.payload?.fullName ?? 'duration',
                  ]}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="durationMs" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.durationMs > 30_000 ? 'var(--warning)' : 'var(--accent)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Recent runs list ── */}
        {!loading && recentJobs.length > 0 && (
          <div style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '18px 20px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
              <List size={13} style={{ color: 'var(--text-muted)' }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Recently Run Jobs</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recentJobs.map(job => {
                const hasError = job.consecutiveErrors > 0
                return (
                  <div key={job.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 8,
                    background: 'transparent',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      {hasError
                        ? <AlertCircle size={13} style={{ color: 'var(--error)', flexShrink: 0 }} />
                        : <CheckCircle size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
                      }
                      <span style={{
                        fontSize: 13, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {job.name}
                      </span>
                      {!job.enabled && (
                        <span style={{
                          fontSize: 10, color: 'var(--text-dim)',
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                        }}>
                          disabled
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0, marginLeft: 12 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 48, textAlign: 'right' }}>
                        {fmtDuration(job.lastDurationMs)}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 64, textAlign: 'right' }}>
                        {fmtRelative(job.lastRunAtMs)}
                      </span>
                      {hasError && (
                        <span style={{ fontSize: 10, color: 'var(--error)', minWidth: 48 }}>
                          {job.consecutiveErrors} err{job.consecutiveErrors !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && jobs.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <Activity size={36} style={{ margin: '0 auto 12px', opacity: 0.25, display: 'block' }} />
            <p style={{ fontSize: 14, margin: '0 0 4px' }}>No cron jobs found.</p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
              Jobs appear in <code style={{ fontSize: 11 }}>~/.openclaw/cron/jobs.json</code>
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
