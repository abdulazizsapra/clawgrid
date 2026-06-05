'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Play, Pause, AlertCircle, CheckCircle, Clock, Timer } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

interface CronJob {
  id: string
  name: string
  agentId: string
  enabled: boolean
  schedule: { kind: string; expr: string; tz: string }
  // from jobs-state.json
  lastRunAtMs?: number
  nextRunAtMs?: number
  lastRunStatus?: string
  lastDurationMs?: number
  consecutiveErrors?: number
}

function StatusIcon({ status }: { status?: string }) {
  if (status === 'ok')      return <CheckCircle size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
  if (status === 'error')   return <AlertCircle size={14} style={{ color: 'var(--error)', flexShrink: 0 }} />
  if (status === 'running') return <RefreshCw size={14} style={{ color: 'var(--accent)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
  return <Clock size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function fmtDate(ms?: number) {
  if (!ms) return null
  const d = new Date(ms)
  const now = Date.now()
  const diff = now - ms
  if (diff < 0) return `in ${fmtMs(Math.abs(diff))}`
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString()
}

export function CronMonitor({ instance }: { instance: OpenClawInstance }) {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState('')

  async function sshExec(command: string) {
    const res = await fetch(`/api/ssh/${instance.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'exec', args: { command } }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.stdout as string
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const cronDir = `${instance.workspacePath}/cron`

      const [jobsRaw, stateRaw] = await Promise.all([
        sshExec(`cat "${cronDir}/jobs.json" 2>/dev/null || echo "null"`),
        sshExec(`cat "${cronDir}/jobs-state.json" 2>/dev/null || echo "null"`),
      ])

      const jobsData = JSON.parse(jobsRaw.trim() || 'null')
      const stateData = JSON.parse(stateRaw.trim() || 'null')

      if (!jobsData) { setJobs([]); setLastRefresh(new Date().toLocaleTimeString()); return }

      const jobsList: CronJob[] = (jobsData.jobs ?? []).map((j: Record<string, unknown>) => {
        const state = stateData?.jobs?.[j.id as string]?.state ?? {}
        return {
          id: j.id as string,
          name: j.name as string,
          agentId: j.agentId as string,
          enabled: j.enabled as boolean,
          schedule: j.schedule as CronJob['schedule'],
          lastRunAtMs: state.lastRunAtMs,
          nextRunAtMs: state.nextRunAtMs,
          lastRunStatus: state.lastRunStatus ?? state.lastStatus,
          lastDurationMs: state.lastDurationMs,
          consecutiveErrors: state.consecutiveErrors,
        }
      })

      setJobs(jobsList)
      setLastRefresh(new Date().toLocaleTimeString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }, [instance.id, instance.workspacePath])

  useEffect(() => { load() }, [load])

  async function toggleJob(job: CronJob) {
    try {
      const cronDir = `${instance.workspacePath}/cron`
      await sshExec(
        `node -e "const fs=require('fs'),p='${cronDir}/jobs.json',d=JSON.parse(fs.readFileSync(p,'utf8')),i=d.jobs.findIndex(j=>j.id==='${job.id}');if(i>=0){d.jobs[i].enabled=!d.jobs[i].enabled;}fs.writeFileSync(p,JSON.stringify(d,null,2));"`
      )
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'toggle failed')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Cron Monitor</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {instance.name} · {jobs.length} job{jobs.length !== 1 ? 's' : ''}
            {lastRefresh && <span> · {lastRefresh}</span>}
          </p>
        </div>
        <button
          onClick={load} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {error && (
          <div style={{ fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading && jobs.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3].map(i => <div key={i} style={{ height: 72, borderRadius: 10, background: 'var(--surface)', animation: 'pulse 2s cubic-bezier(.4,0,.6,1) infinite' }} />)}
          </div>
        )}

        {!loading && jobs.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <Clock size={36} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
            <p style={{ fontSize: 14 }}>No cron jobs found.</p>
            <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-dim)' }}>Jobs are stored in <code>~/.openclaw/cron/jobs.json</code></p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jobs.map(job => (
            <div
              key={job.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '14px 16px', borderRadius: 10,
                background: 'var(--surface)', border: '1px solid var(--border)',
                opacity: job.enabled ? 1 : 0.6,
              }}
            >
              <div style={{ paddingTop: 2 }}>
                <StatusIcon status={job.lastRunStatus} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{job.name}</span>
                  {!job.enabled && (
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text-dim)' }}>paused</span>
                  )}
                  {(job.consecutiveErrors ?? 0) > 0 && (
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: 'var(--error)' }}>
                      {job.consecutiveErrors} errors
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 7px', borderRadius: 4 }}>
                    {job.schedule?.expr}
                  </code>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{job.schedule?.tz}</span>
                  {job.lastRunAtMs && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} /> {fmtDate(job.lastRunAtMs)}
                      {job.lastDurationMs && <span>({fmtMs(job.lastDurationMs)})</span>}
                    </span>
                  )}
                  {job.nextRunAtMs && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Timer size={10} /> next {fmtDate(job.nextRunAtMs)}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => toggleJob(job)}
                title={job.enabled ? 'Pause' : 'Resume'}
                style={{ padding: '6px 8px', borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
              >
                {job.enabled ? <Pause size={12} /> : <Play size={12} />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
