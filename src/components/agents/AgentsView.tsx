'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Zap, User, MessageSquare, Clock, ChevronRight } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

interface AgentDef {
  id: string
  name: string
  role?: string
  description?: string
}

interface AgentInfo {
  id: string
  name: string
  role?: string
  description?: string
  sessionCount: number
}

interface SessionFile {
  path: string
  name: string
  mtime: string
  mtimeRaw: number
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
}

interface AgentDetail {
  agent: AgentInfo
  sessions: SessionFile[]
  conversations: ConversationMessage[]
}

async function sshExec(instanceId: string, command: string): Promise<string> {
  const res = await fetch(`/api/ssh/${instanceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'exec', args: { command } }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.stdout ?? ''
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHr / 24)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return d.toLocaleDateString()
  } catch { return iso }
}

export function AgentsView({ instance }: { instance: OpenClawInstance }) {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AgentInfo | null>(null)
  const [detail, setDetail] = useState<AgentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const wp = instance.workspacePath

  const loadAgents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. List agent directories
      const lsOut = await sshExec(
        instance.id,
        `ls -1 "${wp}/agents/" 2>/dev/null || echo ""`
      )
      const dirs = lsOut.trim().split('\n').filter(Boolean)

      // 2. Read openclaw.json for agent definitions
      const cfgOut = await sshExec(
        instance.id,
        `cat "${wp}/openclaw.json" 2>/dev/null || echo "{}"`
      )
      let agentDefs: Record<string, AgentDef> = {}
      try {
        const cfg = JSON.parse(cfgOut.trim() || '{}')
        const rawAgents = cfg.agents
        if (rawAgents && typeof rawAgents === 'object') {
          if (Array.isArray(rawAgents)) {
            rawAgents.forEach((a: AgentDef) => {
              if (a?.id) agentDefs[a.id] = a
            })
          } else {
            // may be a map keyed by id
            Object.entries(rawAgents).forEach(([key, val]) => {
              const v = val as AgentDef
              agentDefs[key] = { id: key, name: v.name ?? key, role: v.role, description: v.description }
            })
          }
        }
      } catch { /* ignore parse errors */ }

      // 3. For each dir, count sessions in parallel via a single compound command
      if (dirs.length === 0) {
        setAgents([])
        return
      }

      const countCmds = dirs
        .map(d => `printf '%s\\t' "${d}"; ls "${wp}/agents/${d}/sessions/"*.jsonl 2>/dev/null | wc -l | tr -d ' '`)
        .join('; echo; ')
      const countOut = await sshExec(instance.id, `(${countCmds}; echo) 2>/dev/null`)

      const sessionCounts: Record<string, number> = {}
      countOut.trim().split('\n').forEach(line => {
        const parts = line.split('\t')
        if (parts.length >= 2) {
          const name = parts[0].trim()
          const count = parseInt(parts[1].trim(), 10) || 0
          sessionCounts[name] = count
        }
      })

      const infos: AgentInfo[] = dirs.map(dirName => {
        const def = agentDefs[dirName] ?? {}
        return {
          id: dirName,
          name: def.name ?? (dirName.charAt(0).toUpperCase() + dirName.slice(1)),
          role: def.role,
          description: def.description,
          sessionCount: sessionCounts[dirName] ?? 0,
        }
      })

      setAgents(infos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }, [instance.id, wp])

  useEffect(() => { loadAgents() }, [loadAgents])

  const selectAgent = useCallback(async (agent: AgentInfo) => {
    setSelected(agent)
    setDetail(null)
    setDetailLoading(true)

    try {
      // Fetch last 5 sessions by modification time
      const sessionOut = await sshExec(
        instance.id,
        `ls -lt "${wp}/agents/${agent.id}/sessions/"*.jsonl 2>/dev/null | head -5`
      )

      const sessions: SessionFile[] = []
      sessionOut.trim().split('\n').filter(Boolean).forEach(line => {
        // ls -lt output: permissions links owner group size month day time-or-year filename
        const parts = line.trim().split(/\s+/)
        if (parts.length < 9) return
        const filePath = parts.slice(8).join(' ')
        const fileName = filePath.split('/').pop() ?? filePath
        // Extract date parts (month day time/year) — positions 5,6,7
        const datePart = `${parts[5]} ${parts[6]} ${parts[7]}`
        sessions.push({
          path: filePath,
          name: fileName.replace('.jsonl', ''),
          mtime: datePart,
          mtimeRaw: 0,
        })
      })

      // Fetch last 5 messages from conversations/{agentId}.jsonl
      const convOut = await sshExec(
        instance.id,
        `tail -5 "${wp}/conversations/${agent.id}.jsonl" 2>/dev/null || echo ""`
      )

      const conversations: ConversationMessage[] = []
      convOut.trim().split('\n').filter(Boolean).forEach(line => {
        try {
          const msg = JSON.parse(line)
          if (msg.role && msg.content !== undefined) {
            conversations.push({
              role: msg.role,
              content: typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                  ? msg.content.map((c: { text?: string }) => c.text ?? '').join('')
                  : JSON.stringify(msg.content),
              timestamp: msg.timestamp ?? msg.ts ?? undefined,
            })
          }
        } catch { /* skip malformed lines */ }
      })

      setDetail({ agent, sessions, conversations })
    } catch (e) {
      setDetail({
        agent,
        sessions: [],
        conversations: [],
      })
    } finally {
      setDetailLoading(false)
    }
  }, [instance.id, wp])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
        {/* Sidebar header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Zap size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>Agents</span>
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'var(--surface2)', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {agents.length}
            </span>
          </div>
          <button
            onClick={loadAgents}
            disabled={loading}
            style={{ padding: 5, background: 'transparent', border: 'none', borderRadius: 6, color: 'var(--text-muted)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}
          >
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {/* Agent list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {loading && (
            <div style={{ padding: '12px 8px', fontSize: 12, color: 'var(--text-muted)' }}>Loading agents…</div>
          )}
          {!loading && error && (
            <div style={{ padding: '10px 8px', fontSize: 12, color: 'var(--error)' }}>{error}</div>
          )}
          {!loading && agents.length === 0 && !error && (
            <div style={{ padding: '12px 8px', fontSize: 12, color: 'var(--text-muted)' }}>No agents found</div>
          )}
          {agents.map(agent => {
            const isActive = selected?.id === agent.id
            return (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: 8,
                  fontSize: 13,
                  textAlign: 'left',
                  background: isActive ? 'var(--accent-dim)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text)',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: 2,
                  transition: 'background 0.15s',
                }}
              >
                <User size={13} style={{ flexShrink: 0, opacity: 0.75 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{agent.name}</div>
                  {agent.role && (
                    <div style={{ fontSize: 11, color: isActive ? 'var(--accent)' : 'var(--text-muted)', opacity: 0.8, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.role}</div>
                  )}
                </div>
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: isActive ? 'rgba(255,255,255,0.15)' : 'var(--surface2)', color: isActive ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {agent.sessionCount}
                </span>
                <ChevronRight size={11} style={{ flexShrink: 0, opacity: 0.4 }} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Main panel */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface)' }}>
        {!selected && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <Zap size={36} style={{ color: 'var(--text-dim)', opacity: 0.25 }} />
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Select an agent to view details</p>
          </div>
        )}

        {selected && (
          <div style={{ padding: 28, maxWidth: 760 }}>
            {/* Agent header */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-dim)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{selected.name}</h2>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, fontFamily: "'SF Mono','Fira Code',monospace" }}>
                    id: {selected.id}
                  </div>
                </div>
              </div>
              {selected.role && (
                <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border)', marginTop: 6 }}>
                  {selected.role}
                </div>
              )}
              {selected.description && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>{selected.description}</p>
              )}
            </div>

            {detailLoading && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '20px 0' }}>Loading details…</div>
            )}

            {detail && !detailLoading && (
              <>
                {/* Stats row */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
                  <div style={{ flex: 1, padding: '14px 18px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>Sessions</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{selected.sessionCount}</div>
                  </div>
                  <div style={{ flex: 1, padding: '14px 18px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>Conversations</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{detail.conversations.length}</div>
                  </div>
                </div>

                {/* Recent sessions */}
                <section style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                    <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                    <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-dim)' }}>Recent Sessions</h3>
                  </div>
                  {detail.sessions.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '14px 0' }}>No session files found</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {detail.sessions.map((s, i) => (
                        <div
                          key={i}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', opacity: 0.6, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontFamily: "'SF Mono','Fira Code',monospace", color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }}>
                              {s.name}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{s.mtime}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Recent conversations */}
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                    <MessageSquare size={13} style={{ color: 'var(--text-muted)' }} />
                    <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-dim)' }}>Recent Conversations</h3>
                  </div>
                  {detail.conversations.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '14px 0' }}>
                      No conversation history found at conversations/{selected.id}.jsonl
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {detail.conversations.map((msg, i) => {
                        const isUser = msg.role === 'user'
                        const isSystem = msg.role === 'system'
                        return (
                          <div
                            key={i}
                            style={{
                              padding: '12px 14px',
                              borderRadius: 10,
                              background: isSystem ? 'var(--surface3)' : isUser ? 'var(--surface2)' : 'var(--accent-dim)',
                              border: `1px solid ${isSystem ? 'var(--border)' : isUser ? 'var(--border)' : 'var(--border)'}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                color: isSystem ? 'var(--text-dim)' : isUser ? 'var(--text-muted)' : 'var(--accent)',
                                padding: '1px 6px',
                                borderRadius: 6,
                                background: isUser ? 'var(--surface3)' : isSystem ? 'var(--surface)' : 'rgba(255,255,255,0.08)',
                              }}>
                                {msg.role}
                              </span>
                              {msg.timestamp && (
                                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{formatTime(msg.timestamp)}</span>
                              )}
                            </div>
                            <p style={{ fontSize: 13, color: isSystem ? 'var(--text-dim)' : 'var(--text)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {msg.content.length > 400 ? msg.content.slice(0, 400) + '…' : msg.content}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
