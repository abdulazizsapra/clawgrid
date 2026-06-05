'use client'
import { sshExec } from '@/lib/utils'
import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Search, MessageSquare, User, Bot, ChevronDown, ChevronUp, X } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConvFile {
  name: string      // e.g. "command"
  filename: string  // e.g. "command.jsonl"
  lines: number
}

interface ToolUseBlock { type: 'tool_use'; id?: string; name: string; input?: Record<string, unknown> }
interface ToolResultBlock { type: 'tool_result'; tool_use_id?: string; content?: string | Array<{type:string;text?:string}> }
type ContentBlock = ToolUseBlock | ToolResultBlock | { type: 'text'; text: string }

interface ConvMsg {
  id?: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  contentBlocks?: ContentBlock[]   // parsed when content is array
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  timestamp?: number
  raw: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ms?: number) {
  if (!ms) return ''
  const d = new Date(ms)
  const now = Date.now()
  const diff = now - ms
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
}

function excerpt(text: string, maxLen = 120) {
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

function parseMessages(raw: string): ConvMsg[] {
  return raw.trim().split('\n').filter(Boolean).map(line => {
    try {
      const obj = JSON.parse(line)
      const blocks: ContentBlock[] = Array.isArray(obj.content) ? obj.content : []

      // Detect tool_use inside assistant messages
      const toolUse = blocks.find((b): b is ToolUseBlock => b.type === 'tool_use')
      const toolResult = blocks.find((b): b is ToolResultBlock => b.type === 'tool_result')

      const textContent = typeof obj.content === 'string'
        ? obj.content
        : blocks
            .filter(b => b.type === 'text')
            .map(b => (b as {type:'text';text:string}).text ?? '')
            .join('') || (toolUse ? `[tool: ${toolUse.name}]` : toolResult ? '[tool result]' : '')

      return {
        id: obj.id,
        role: obj.role ?? 'assistant',
        content: textContent,
        contentBlocks: blocks.length ? blocks : undefined,
        toolName: toolUse?.name,
        toolInput: toolUse?.input,
        toolResult: toolResult
          ? (typeof toolResult.content === 'string'
              ? toolResult.content
              : Array.isArray(toolResult.content)
                ? toolResult.content.map((c: {text?:string}) => c.text ?? '').join('')
                : '')
          : undefined,
        timestamp: obj.timestamp ?? obj.ts,
        raw: line,
      }
    } catch {
      return { role: 'assistant' as const, content: line, raw: line }
    }
  })
}

// ─── Message row ──────────────────────────────────────────────────────────────

function MsgRow({ msg, query }: { msg: ConvMsg; query: string }) {
  const [expanded, setExpanded] = useState(false)
  const [toolExpanded, setToolExpanded] = useState(false)
  const isUser = msg.role === 'user'
  const isSys = msg.role === 'system' || msg.role === 'tool'
  const isTool = !!(msg.toolName || msg.toolResult)
  const isLong = msg.content.length > 200
  const display = expanded || !isLong ? msg.content : excerpt(msg.content, 200)

  const highlight = (text: string) => {
    if (!query) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(251,191,36,0.3)', color: 'inherit', borderRadius: 2 }}>
          {text.slice(idx, idx + query.length)}
        </mark>
        {text.slice(idx + query.length)}
      </>
    )
  }

  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 14px',
      borderRadius: 8, margin: '3px 0',
      background: isSys ? 'rgba(124,58,237,0.06)' : isUser ? 'var(--surface2)' : 'transparent',
      border: isSys ? '1px solid rgba(124,58,237,0.2)' : isUser ? '1px solid var(--border)' : '1px solid transparent',
    }}>
      {/* Avatar */}
      <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isUser ? 'var(--accent-dim)' : isSys ? 'rgba(124,58,237,0.15)' : 'var(--surface3)' }}>
        {isUser ? <User size={12} style={{ color: 'var(--accent)' }} />
          : isSys ? <span style={{ fontSize: 10 }}>🔧</span>
          : <Bot size={12} style={{ color: 'var(--text-muted)' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: isUser ? 'var(--accent)' : isSys ? '#a78bfa' : 'var(--text-muted)' }}>
            {msg.role}
          </span>
          {msg.timestamp && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fmtTime(msg.timestamp)}</span>}
          {msg.content.length > 0 && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>{msg.content.length} chars</span>}
        </div>
        {msg.content && !isTool && (
          <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {highlight(display)}
          </p>
        )}
        {isLong && !isTool && (
          <button onClick={() => setExpanded(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {expanded ? <><ChevronUp size={11} /> Show less</> : <><ChevronDown size={11} /> Show more ({msg.content.length} chars)</>}
          </button>
        )}

        {/* Tool call display */}
        {msg.toolName && (
          <div style={{ marginTop: 4, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => setToolExpanded(s => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 10 }}>🔧</span>
              <code style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'monospace', fontWeight: 600 }}>{msg.toolName}</code>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>{toolExpanded ? '▲' : '▼'} args</span>
            </button>
            {toolExpanded && msg.toolInput && (
              <pre style={{ margin: 0, padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)', overflow: 'auto', maxHeight: 200, borderTop: '1px solid rgba(139,92,246,0.15)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(msg.toolInput, null, 2)}
              </pre>
            )}
          </div>
        )}
        {msg.toolResult !== undefined && (
          <div style={{ marginTop: 4, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => setToolExpanded(s => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 10 }}>✅</span>
              <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>Tool result</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>{toolExpanded ? '▲' : '▼'}</span>
            </button>
            {toolExpanded && (
              <pre style={{ margin: 0, padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.1)', overflow: 'auto', maxHeight: 200, borderTop: '1px solid rgba(34,197,94,0.1)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {msg.toolResult || '(empty)'}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionsView({ instance }: { instance: OpenClawInstance }) {
  const [files, setFiles] = useState<ConvFile[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConvMsg[]>([])
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [lastRefresh, setLastRefresh] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const convDir = `${instance.workspacePath}/conversations`

  const loadFiles = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const out = await sshExec(instance.id, `ls "${convDir}"/*.jsonl 2>/dev/null | xargs -I{} sh -c 'echo -n "$(basename {}) "; wc -l < {}' 2>/dev/null || echo ""`)
      const list: ConvFile[] = []
      out.trim().split('\n').filter(Boolean).forEach(line => {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 2) {
          const filename = parts[0]
          const lines = parseInt(parts[1]) || 0
          list.push({ name: filename.replace('.jsonl', ''), filename, lines })
        }
      })
      setFiles(list)
      setLastRefresh(new Date().toLocaleTimeString())
      if (list.length > 0 && !activeFile) {
        setActiveFile(list[0].name)
        loadMessages(list[0].name)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [instance.id, convDir])

  async function loadMessages(name: string) {
    setMsgLoading(true)
    try {
      const out = await sshExec(instance.id, `cat "${convDir}/${name}.jsonl" 2>/dev/null || echo ""`)
      setMessages(parseMessages(out))
    } catch (e) {
      setMessages([])
      setError(e instanceof Error ? e.message : 'Failed to load messages')
    } finally {
      setMsgLoading(false)
    }
  }

  function selectFile(name: string) {
    setActiveFile(name)
    setMessages([])
    setQuery('')
    loadMessages(name)
  }

  useEffect(() => { loadFiles() }, [loadFiles])

  useEffect(() => {
    if (!query) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, query])

  const filtered = query
    ? messages.filter(m => m.content.toLowerCase().includes(query.toLowerCase()) || m.role.includes(query.toLowerCase()))
    : messages

  const stats = {
    user: messages.filter(m => m.role === 'user').length,
    assistant: messages.filter(m => m.role === 'assistant').length,
    total: messages.length,
  }

  const activeFileObj = files.find(f => f.name === activeFile)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Conversations</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, margin: 0 }}>
            {instance.name} · {files.length} agent{files.length !== 1 ? 's' : ''}
            {lastRefresh && <span style={{ color: 'var(--text-dim)' }}> · {lastRefresh}</span>}
          </p>
        </div>
        <button onClick={loadFiles} disabled={loading} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {error && <div style={{ padding: '8px 18px', fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', flexShrink: 0 }}>{error}</div>}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* File list */}
        <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto', background: 'var(--surface)' }}>
          <div style={{ padding: '10px 10px 4px', fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Agent Conversations
          </div>
          {loading && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
          {files.map(f => (
            <button key={f.name} onClick={() => selectFile(f.name)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px',
              textAlign: 'left', background: activeFile === f.name ? 'var(--accent-dim)' : 'transparent',
              color: activeFile === f.name ? 'var(--accent)' : 'var(--text-muted)',
              border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 0,
            }}>
              <MessageSquare size={12} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.name}</span>
              <span style={{ fontSize: 10, color: activeFile === f.name ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }}>{f.lines}</span>
            </button>
          ))}
          {!loading && files.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>No conversations found</div>
          )}
        </div>

        {/* Message viewer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {activeFile ? (
            <>
              {/* Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
                {/* Stats */}
                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{stats.total} messages</span>
                  <span style={{ color: 'var(--accent)' }}>{stats.user}↑ user</span>
                  <span style={{ color: 'var(--success)' }}>{stats.assistant}↓ agent</span>
                </div>
                <div style={{ flex: 1 }} />
                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', minWidth: 200 }}>
                  <Search size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                  <input
                    value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="Search messages…"
                    style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, width: '100%', color: 'var(--text)', padding: 0 }}
                  />
                  {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0 }}><X size={11} /></button>}
                </div>
                {query && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} matches</span>}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
                {msgLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '20px 0' }}>Loading messages…</div>}
                {!msgLoading && filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <MessageSquare size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.2 }} />
                    <p style={{ fontSize: 14, margin: 0 }}>{query ? 'No matches found' : 'No messages'}</p>
                  </div>
                )}
                {filtered.map((msg, i) => (
                  <MsgRow key={msg.id ?? i} msg={msg} query={query} />
                ))}
                <div ref={bottomRef} />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
              <MessageSquare size={36} style={{ opacity: 0.2 }} />
              <p style={{ fontSize: 14 }}>Select a conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
