'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Zap, User, ChevronRight } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

interface Agent {
  id: string
  name: string
  role?: string
  parentId?: string
  soulFile?: string
  description?: string
}

export function AgentsView({ instance }: { instance: OpenClawInstance }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Agent | null>(null)
  const [soul, setSoul] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Try agents.json first, then scan for SOUL.md files
      const res = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exec', args: { command: `cat "${instance.workspacePath}/agents.json" 2>/dev/null || cat "${instance.workspacePath}/clawport/agents.json" 2>/dev/null || echo "null"` } }),
      })
      const data = await res.json()
      let parsed: Agent[] = []
      try {
        const raw = JSON.parse(data.stdout || 'null')
        if (raw && Array.isArray(raw)) parsed = raw
        else if (raw?.agents) parsed = raw.agents
      } catch { /* fall through to scan */ }

      if (parsed.length === 0) {
        // Scan for SOUL.md files
        const scanRes = await fetch(`/api/ssh/${instance.id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'exec', args: { command: `find "${instance.workspacePath}/agents" -name "SOUL.md" 2>/dev/null | head -20` } }),
        })
        const scanData = await scanRes.json()
        const paths: string[] = (scanData.stdout || '').trim().split('\n').filter(Boolean)
        parsed = paths.map(p => {
          const parts = p.split('/')
          const name = parts[parts.indexOf('agents') + 1] ?? parts[parts.length - 2] ?? 'unknown'
          return { id: name.toLowerCase().replace(/\s+/g, '-'), name, soulFile: p }
        })
      }
      setAgents(parsed)
    } catch (e) { setError(e instanceof Error ? e.message : 'failed') }
    finally { setLoading(false) }
  }, [instance.id, instance.workspacePath])

  useEffect(() => { load() }, [load])

  async function viewSoul(agent: Agent) {
    setSelected(agent); setSoul('Loading…')
    const path = agent.soulFile ?? `${instance.workspacePath}/agents/${agent.name}/SOUL.md`
    const res = await fetch(`/api/ssh/${instance.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'exec', args: { command: `cat "${path}" 2>/dev/null || echo "No SOUL.md found"` } }),
    })
    const data = await res.json()
    setSoul(data.stdout || 'Empty')
  }

  return (
    <div className="flex" style={{ height: '100vh' }}>
      <div className="w-64 shrink-0 flex flex-col" style={{ borderRight: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Zap size={14} style={{ color: 'var(--accent)' }} />
            <span className="font-semibold text-sm">Agents</span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{agents.length}</span>
          </div>
          <button onClick={load} disabled={loading} style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {agents.map(agent => (
            <button key={agent.id} onClick={() => viewSoul(agent)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors"
              style={{ background: selected?.id === agent.id ? 'rgba(59,130,246,0.12)' : 'transparent', color: selected?.id === agent.id ? 'var(--accent)' : 'var(--text)' }}>
              <User size={13} />
              <span className="flex-1 truncate">{agent.name}</span>
              {agent.role && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{agent.role}</span>}
              <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
            </button>
          ))}
          {!loading && agents.length === 0 && <p className="text-xs px-3 py-2" style={{ color: 'var(--text-muted)' }}>No agents found</p>}
        </div>
      </div>
      <div className="flex-1 p-5 overflow-auto">
        {!selected && (
          <div className="h-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <p className="text-sm">Select an agent to view its SOUL</p>
          </div>
        )}
        {selected && (
          <>
            <h2 className="font-semibold mb-1">{selected.name}</h2>
            {selected.role && <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{selected.role}</p>}
            <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{soul}</pre>
          </>
        )}
        {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
      </div>
    </div>
  )
}
