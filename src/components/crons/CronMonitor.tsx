'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Play, Pause, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OpenClawInstance } from '@/types'

interface CronEntry {
  id: string
  name: string
  schedule: string
  enabled: boolean
  lastRun?: string
  lastStatus?: 'ok' | 'error' | 'running'
  lastError?: string
  nextRun?: string
  runCount?: number
}

function StatusIcon({ status }: { status?: string }) {
  if (status === 'ok') return <CheckCircle size={14} className="text-green-400" />
  if (status === 'error') return <AlertCircle size={14} className="text-red-400" />
  if (status === 'running') return <RefreshCw size={14} className="text-blue-400 animate-spin" />
  return <Clock size={14} className="text-gray-500" />
}

export function CronMonitor({ instance }: { instance: OpenClawInstance }) {
  const [crons, setCrons] = useState<CronEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'exec',
          args: { command: `cat ${instance.workspacePath}/crons.json 2>/dev/null || echo "[]"` },
        }),
      })
      const data = await res.json()
      const raw = data.stdout?.trim() || '[]'
      try {
        const parsed = JSON.parse(raw)
        setCrons(Array.isArray(parsed) ? parsed : (parsed.crons ?? []))
      } catch {
        setCrons([])
      }
      setLastRefresh(new Date().toLocaleTimeString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }, [instance.id, instance.workspacePath])

  useEffect(() => { load() }, [load])

  async function toggleCron(cron: CronEntry) {
    await fetch(`/api/ssh/${instance.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'exec',
        args: {
          command: `node -e "
const fs=require('fs');
const p='${instance.workspacePath}/crons.json';
const d=JSON.parse(fs.readFileSync(p,'utf8'));
const arr=Array.isArray(d)?d:(d.crons??[]);
const i=arr.findIndex(c=>c.id==='${cron.id}');
if(i>=0)arr[i].enabled=!arr[i].enabled;
if(Array.isArray(d))fs.writeFileSync(p,JSON.stringify(arr,null,2));
else{d.crons=arr;fs.writeFileSync(p,JSON.stringify(d,null,2));}
"`,
        },
      }),
    })
    load()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Cron Monitor</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {instance.name} · {crons.length} job{crons.length !== 1 ? 's' : ''}
            {lastRefresh && <span className="ml-2">· refreshed {lastRefresh}</span>}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {loading && crons.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      )}

      {!loading && crons.length === 0 && !error && (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <Clock size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No cron jobs found for this instance.</p>
          <p className="text-xs mt-1">Cron jobs are defined in <code>crons.json</code> in the workspace.</p>
        </div>
      )}

      <div className="space-y-2">
        {crons.map(cron => (
          <div
            key={cron.id}
            className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <StatusIcon status={cron.lastStatus} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{cron.name}</span>
                {!cron.enabled && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                    paused
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                <code>{cron.schedule}</code>
                {cron.lastRun && <span>last: {new Date(cron.lastRun).toLocaleString()}</span>}
                {cron.nextRun && <span>next: {new Date(cron.nextRun).toLocaleString()}</span>}
                {cron.runCount !== undefined && <span>{cron.runCount} runs</span>}
              </div>
              {cron.lastError && (
                <p className="text-xs mt-1 truncate" style={{ color: 'var(--error)' }}>{cron.lastError}</p>
              )}
            </div>

            <button
              onClick={() => toggleCron(cron)}
              className="p-1.5 rounded-lg transition-colors shrink-0"
              style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}
              title={cron.enabled ? 'Pause' : 'Resume'}
            >
              {cron.enabled ? <Pause size={13} /> : <Play size={13} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
