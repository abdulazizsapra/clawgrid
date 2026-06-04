'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, Terminal, RotateCcw } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

export function LogViewer({ instance }: { instance: OpenClawInstance }) {
  const [logs, setLogs] = useState('')
  const [stats, setStats] = useState('')
  const [lines, setLines] = useState(200)
  const [tab, setTab] = useState<'logs' | 'stats'>('logs')
  const [loading, setLoading] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [restartMsg, setRestartMsg] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logs', args: { lines } }),
      })
      const data = await res.json()
      setLogs(data.logs ?? data.error ?? 'No output')
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
    } finally {
      setLoading(false)
    }
  }, [instance.id, lines])

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stats' }),
      })
      const data = await res.json()
      setStats(data.stats ?? data.error ?? 'No output')
    } finally {
      setLoading(false)
    }
  }, [instance.id])

  useEffect(() => {
    if (tab === 'logs') loadLogs()
    else loadStats()
  }, [tab, loadLogs, loadStats])

  async function restart() {
    if (!confirm(`Restart OpenClaw gateway on ${instance.name}?`)) return
    setRestarting(true)
    setRestartMsg('')
    try {
      const res = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      })
      const data = await res.json()
      setRestartMsg(data.code === 0 ? 'Gateway restarted successfully.' : `Exit ${data.code}: ${data.stderr}`)
      setTimeout(loadLogs, 3000)
    } catch (e) {
      setRestartMsg(e instanceof Error ? e.message : 'error')
    } finally {
      setRestarting(false)
    }
  }

  const TABS = [{ id: 'logs', label: 'Gateway Logs' }, { id: 'stats', label: 'System Stats' }] as const

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <Terminal size={15} style={{ color: 'var(--accent)' }} />
          <div className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-3 py-1 rounded-md text-sm transition-colors"
                style={{
                  background: tab === t.id ? 'var(--surface2)' : 'transparent',
                  color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'logs' && (
            <select
              value={lines}
              onChange={e => setLines(Number(e.target.value))}
              className="text-xs rounded-md px-2 py-1 outline-none"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n} lines</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={restart}
            disabled={restarting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <RotateCcw size={11} className={restarting ? 'animate-spin' : ''} />
            Restart Gateway
          </button>
          <button
            onClick={() => tab === 'logs' ? loadLogs() : loadStats()}
            disabled={loading}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {restartMsg && (
        <div className="px-5 py-2 text-xs" style={{ background: 'var(--surface2)', color: restartMsg.includes('success') ? 'var(--success)' : 'var(--error)' }}>
          {restartMsg}
        </div>
      )}

      <div className="flex-1 overflow-auto p-5 font-mono text-xs leading-relaxed" style={{ background: 'var(--bg)' }}>
        <pre className="whitespace-pre-wrap" style={{ color: '#a3e635' }}>
          {tab === 'logs' ? (logs || (loading ? 'Loading…' : 'No logs')) : (stats || (loading ? 'Loading…' : 'No data'))}
        </pre>
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
