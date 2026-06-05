'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import type { OpenClawInstance, ChatMessage } from '@/types'

// ─── Keyframes ────────────────────────────────────────────────────────────────
const STYLE = `
@keyframes oc-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%            { transform: translateY(-5px); opacity: 1; }
}
@keyframes oc-fadein {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
}
.oc-msg { animation: oc-fadein 0.2s ease-out both; }
.oc-code pre { margin: 0; overflow-x: auto; }
.oc-code code { font-family: 'SF Mono','Fira Code',monospace; font-size: 12px; }
.oc-prose code { background: rgba(59,130,246,0.12); color: #93c5fd; padding: 1px 5px; border-radius: 4px; font-family: 'SF Mono','Fira Code',monospace; font-size: 0.87em; }
.oc-prose pre { background: #111318; border: 1px solid #2e3138; border-radius: 8px; padding: 12px 14px; margin: 8px 0; overflow-x: auto; }
.oc-prose pre code { background: none; color: #e8eaf0; padding: 0; font-size: 12.5px; }
.oc-prose p { margin: 0 0 8px; }
.oc-prose p:last-child { margin: 0; }
.oc-prose ul, .oc-prose ol { margin: 4px 0 8px 20px; }
.oc-prose li { margin: 2px 0; }
.oc-prose h1,.oc-prose h2,.oc-prose h3 { font-weight: 600; margin: 12px 0 6px; color: #e8eaf0; }
.oc-prose h1 { font-size: 17px; }
.oc-prose h2 { font-size: 15px; }
.oc-prose h3 { font-size: 13px; }
.oc-prose strong { color: #f1f5f9; font-weight: 600; }
.oc-prose hr { border: none; border-top: 1px solid #2e3138; margin: 12px 0; }
`

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById('oc-chat-style')) return
  const el = document.createElement('style')
  el.id = 'oc-chat-style'
  el.textContent = STYLE
  document.head.appendChild(el)
}

// ─── Simple markdown renderer ─────────────────────────────────────────────────
function MarkdownContent({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = codeBlockRe.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<InlineMarkdown key={last} text={text.slice(last, m.index)} />)
    }
    const lang = m[1] || 'text'
    const code = m[2].replace(/\n$/, '')
    parts.push(
      <div key={m.index} style={{ position: 'relative', margin: '8px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#0d1117', border: '1px solid #2e3138',
          borderBottom: 'none', borderRadius: '8px 8px 0 0',
          padding: '5px 12px',
        }}>
          <span style={{ fontSize: 11, color: '#7a7f8e', fontFamily: 'monospace' }}>{lang}</span>
          <CopyBtn text={code} small />
        </div>
        <pre style={{
          background: '#111318', border: '1px solid #2e3138', borderTop: 'none',
          borderRadius: '0 0 8px 8px', padding: '10px 14px', margin: 0,
          overflow: 'auto', maxHeight: 400,
        }}>
          <code style={{ fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 12.5, color: '#e8eaf0', display: 'block', whiteSpace: 'pre' }}>
            {code}
          </code>
        </pre>
      </div>
    )
    last = m.index + m[0].length
  }
  if (last < text.length) {
    parts.push(<InlineMarkdown key={last} text={text.slice(last)} />)
  }
  return <div className="oc-prose" style={{ fontSize: 14, lineHeight: 1.65, wordBreak: 'break-word' }}>{parts}</div>
}

function InlineMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('### ')) { nodes.push(<h3 key={i}>{inlineFormat(line.slice(4))}</h3>); i++; continue }
    if (line.startsWith('## '))  { nodes.push(<h2 key={i}>{inlineFormat(line.slice(3))}</h2>); i++; continue }
    if (line.startsWith('# '))   { nodes.push(<h1 key={i}>{inlineFormat(line.slice(2))}</h1>); i++; continue }
    if (line === '---' || line === '***') { nodes.push(<hr key={i} />); i++; continue }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: React.ReactNode[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i}>{inlineFormat(lines[i].slice(2))}</li>)
        i++
      }
      nodes.push(<ul key={i}>{items}</ul>)
      continue
    }
    if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i}>{inlineFormat(lines[i].replace(/^\d+\. /, ''))}</li>)
        i++
      }
      nodes.push(<ol key={i}>{items}</ol>)
      continue
    }
    if (line === '') { i++; continue }
    nodes.push(<p key={i}>{inlineFormat(line)}</p>)
    i++
  }
  return <>{nodes}</>
}

function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const s = m[0]
    if (s.startsWith('`')) parts.push(<code key={m.index}>{s.slice(1, -1)}</code>)
    else if (s.startsWith('**') || s.startsWith('__')) parts.push(<strong key={m.index}>{inlineFormat(s.slice(2, -2))}</strong>)
    else parts.push(<em key={m.index}>{inlineFormat(s.slice(1, -1))}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text, small }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  const size = small ? 11 : 12
  return (
    <button onClick={copy} title="Copy" style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: copied ? 'var(--success)' : 'var(--text-dim)',
      padding: small ? '2px 4px' : '3px 6px', borderRadius: 4,
      fontSize: size, display: 'flex', alignItems: 'center', gap: 3,
      transition: 'color 0.15s',
    }}>
      {copied ? '✓ Copied' : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  )
}

// ─── Typing dots ──────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 2px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: 'var(--text-muted)',
          display: 'inline-block',
          animation: `oc-bounce 1.2s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, isStreaming, avatar }: {
  msg: ChatMessage
  isStreaming: boolean
  avatar: string
}) {
  const isUser = msg.role === 'user'
  const isEmpty = isStreaming && msg.content === ''
  const [hover, setHover] = useState(false)

  return (
    <div className="oc-msg" style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start', gap: 10, maxWidth: '100%',
    }}>
      {/* Avatar */}
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginTop: 2,
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, userSelect: 'none',
        }}>
          {avatar}
        </div>
      )}

      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '78%', gap: 4,
        position: 'relative',
      }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div style={{
          padding: '10px 14px', borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
          background: isUser ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'var(--surface2)',
          color: isUser ? '#fff' : 'var(--text)',
          boxShadow: isUser ? '0 2px 8px rgba(59,130,246,0.25)' : '0 1px 3px rgba(0,0,0,0.12)',
          border: isUser ? 'none' : '1px solid var(--border)',
        }}>
          {isEmpty ? <TypingDots /> : (
            isUser
              ? <span style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>
              : <MarkdownContent text={msg.content} />
          )}
        </div>

        {/* Actions row */}
        {!isEmpty && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: hover ? 1 : 0, transition: 'opacity 0.15s',
          }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', userSelect: 'none' }}>
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <CopyBtn text={msg.content} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ name, avatar, agentId }: { name: string; avatar: string; agentId: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14, padding: '40px 24px', userSelect: 'none',
    }}>
      <div style={{ position: 'relative' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', fontSize: 32,
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '2px solid var(--border)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>{avatar}</div>
        <span style={{
          position: 'absolute', bottom: 3, right: 3,
          width: 14, height: 14, borderRadius: '50%',
          background: '#22c55e', border: '2.5px solid var(--bg)',
        }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>{name}</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Agent ID: <code style={{ fontSize: 11, color: 'var(--accent)' }}>{agentId}</code>
          <br />Send a message to start a conversation.
        </p>
      </div>
    </div>
  )
}

// ─── Main ChatPanel ───────────────────────────────────────────────────────────
interface GatewayConf { assistantName: string; assistantAvatar: string; assistantAgentId: string }

export function ChatPanel({ instance }: { instance: OpenClawInstance }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [gwConf, setGwConf] = useState<GatewayConf | null>(null)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystem, setShowSystem] = useState(false)
  const [clearHover, setClearHover] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { injectStyle() }, [])

  // Load persisted data
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`chat:${instance.id}`)
      if (saved) setMessages(JSON.parse(saved))
      const sp = localStorage.getItem(`chat:${instance.id}:system`)
      if (sp) setSystemPrompt(sp)
    } catch { /* ignore */ }
  }, [instance.id])

  // Fetch gateway config for real agent name + avatar
  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    fetch(`/api/gateway/${instance.id}/config`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((d: GatewayConf | null) => { if (d) setGwConf(d) })
      .catch(() => null)
      .finally(() => clearTimeout(timer))
    return () => ctrl.abort()
  }, [instance.id])

  // Auto-scroll + persist
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (messages.length > 0) {
      try { localStorage.setItem(`chat:${instance.id}`, JSON.stringify(messages.slice(-120))) } catch { /* ignore */ }
    }
  }, [messages, instance.id])

  const agentName = gwConf?.assistantName ?? instance.name
  const agentAvatar = gwConf?.assistantAvatar ?? '🤖'
  const agentId = gwConf?.assistantAgentId ?? 'main'

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date().toISOString() }
    const history = [...messages, userMsg]
    setMessages(history)
    setStreaming(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() }])

    const abort = new AbortController()
    abortRef.current = abort

    const apiMessages = [
      ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
      ...history.map(m => ({ role: m.role, content: m.content })),
    ]

    try {
      const res = await fetch(`/api/gateway/${instance.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openclaw', messages: apiMessages, stream: true }),
        signal: abort.signal,
      })

      if (!res.ok) {
        const errText = await res.text()
        let msg = `HTTP ${res.status}`
        try { msg = JSON.parse(errText)?.error?.message ?? msg } catch { /* ignore */ }
        throw new Error(msg)
      }

      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let assembled = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') { reader.cancel(); break }
          try {
            const chunk = JSON.parse(data)
            const delta = chunk.choices?.[0]?.delta?.content
            if (delta) {
              assembled += delta
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assembled } : m))
            }
          } catch { /* skip malformed */ }
        }
      }

      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, timestamp: new Date().toISOString() } : m))
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setMessages(prev => prev.map(m => m.id === assistantId && m.content === '' ? { ...m, content: '_(stopped)_' } : m))
      } else {
        setMessages(prev => prev.map(m => m.id === assistantId
          ? { ...m, content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`, timestamp: new Date().toISOString() }
          : m
        ))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, streaming, messages, instance.id, systemPrompt])

  function stopGeneration() {
    abortRef.current?.abort()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  function clearChat() {
    setMessages([])
    localStorage.removeItem(`chat:${instance.id}`)
  }

  function saveSystemPrompt(val: string) {
    setSystemPrompt(val)
    try { localStorage.setItem(`chat:${instance.id}:system`, val) } catch { /* ignore */ }
  }

  const canSend = input.trim().length > 0 && !streaming

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 18px', background: 'var(--surface)',
        borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', fontSize: 18,
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: '1.5px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{agentAvatar}</div>
            <span style={{
              position: 'absolute', bottom: 1, right: 1, width: 9, height: 9,
              borderRadius: '50%', background: '#22c55e', border: '2px solid var(--surface)',
            }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {agentName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
              <code style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '1px 5px', borderRadius: 3 }}>
                {agentId}
              </code>
              <span style={{ marginLeft: 6, color: 'var(--text-dim)' }}>{instance.name}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* System prompt toggle */}
          <button
            onClick={() => setShowSystem(s => !s)}
            title="System prompt"
            style={{
              padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 500,
              border: '1px solid var(--border)',
              background: showSystem ? 'var(--accent-dim)' : 'var(--surface2)',
              color: showSystem ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            System
          </button>

          {/* Clear button */}
          <button
            onClick={clearChat}
            onMouseEnter={() => setClearHover(true)}
            onMouseLeave={() => setClearHover(false)}
            title="Clear chat"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
              borderRadius: 7, border: '1px solid var(--border)', fontSize: 11, fontWeight: 500,
              background: clearHover ? 'rgba(239,68,68,0.08)' : 'var(--surface2)',
              color: clearHover ? 'var(--error)' : 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Clear
          </button>
        </div>
      </div>

      {/* ── System prompt panel ── */}
      {showSystem && (
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>System Prompt</p>
          <textarea
            value={systemPrompt}
            onChange={e => saveSystemPrompt(e.target.value)}
            placeholder="Provide context or instructions for the agent..."
            rows={3}
            style={{
              width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--text)',
              resize: 'vertical', fontFamily: 'inherit', outline: 'none', lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* ── Messages ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: messages.length === 0 ? 0 : '20px 18px 12px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {messages.length === 0
          ? <EmptyState name={agentName} avatar={agentAvatar} agentId={agentId} />
          : messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isStreaming={streaming && idx === messages.length - 1 && msg.role === 'assistant'}
              avatar={agentAvatar}
            />
          ))
        }
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      {/* ── Input ── */}
      <div style={{ padding: '10px 14px 14px', background: 'var(--surface)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '8px 10px 8px 14px',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={autoResize}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agentName}…`}
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              resize: 'none', fontSize: 14, lineHeight: 1.6, color: 'var(--text)',
              maxHeight: 160, minHeight: 22, fontFamily: 'inherit', padding: 0,
            }}
          />

          {streaming ? (
            <button onClick={stopGeneration} title="Stop" style={{
              width: 34, height: 34, borderRadius: 10, border: 'none', flexShrink: 0,
              background: 'var(--error)', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
          ) : (
            <button onClick={send} disabled={!canSend} title="Send" style={{
              width: 34, height: 34, borderRadius: 10, border: 'none', flexShrink: 0,
              background: canSend ? '#3b82f6' : 'var(--surface3)',
              color: canSend ? '#fff' : 'var(--text-dim)', cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          )}
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', marginTop: 7, userSelect: 'none' }}>
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
