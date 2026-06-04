'use client'
import { useState, useEffect, useCallback } from 'react'
import { Radio, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

interface Channel {
  type: string
  enabled: boolean
  config?: Record<string, string>
}

const CHANNEL_ICONS: Record<string, string> = {
  slack: '💬', discord: '🎮', telegram: '✈️', whatsapp: '📱',
  teams: '🏢', gmail: '📧', browser: '🌐', anthropic: '🤖',
}

export function ChannelsView({ instance }: { instance: OpenClawInstance }) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [rawConfig, setRawConfig] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exec', args: { command: `cat "${instance.workspacePath}/openclaw.json" 2>/dev/null || cat ~/.openclaw/openclaw.json 2>/dev/null` } }),
      })
      const data = await res.json()
      const raw = data.stdout || ''
      setRawConfig(raw)
      try {
        const config = JSON.parse(raw)
        const plugins: Channel[] = (config.plugins || []).map((p: string | { name: string; enabled?: boolean; [k: string]: unknown }) => {
          if (typeof p === 'string') return { type: p, enabled: true }
          return { type: p.name ?? String(p), enabled: p.enabled !== false, config: p as Record<string, string> }
        })
        setChannels(plugins)
      } catch { setChannels([]) }
    } finally { setLoading(false) }
  }, [instance.id, instance.workspacePath])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Radio size={16} style={{ color: 'var(--accent)' }} />
          <h1 className="text-xl font-semibold">Channels & Plugins</h1>
        </div>
        <button onClick={load} disabled={loading} className="p-1.5 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {!loading && channels.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {channels.map(ch => (
            <div key={ch.type} className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="text-2xl">{CHANNEL_ICONS[ch.type] ?? '🔌'}</span>
              <div className="flex-1">
                <div className="font-medium text-sm capitalize">{ch.type}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>plugin</div>
              </div>
              {ch.enabled
                ? <CheckCircle size={16} className="text-green-400 shrink-0" />
                : <XCircle size={16} className="text-red-400 shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {!loading && channels.length === 0 && (
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>No plugins found in openclaw.json</p>
      )}

      {rawConfig && (
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>RAW CONFIG (openclaw.json)</p>
          <pre className="text-xs font-mono leading-relaxed rounded-xl p-4 overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: '#a3e635', maxHeight: 400 }}>
            {rawConfig}
          </pre>
        </div>
      )}
    </div>
  )
}
