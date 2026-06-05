'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import type { OpenClawInstance, ChatMessage } from '@/types'

// ─── Keyframe animations injected once ───────────────────────────────────────
const KEYFRAMES = `
@keyframes oc-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%            { transform: translateY(-5px); opacity: 1; }
}
@keyframes oc-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes oc-pulse-ring {
  0%   { transform: scale(0.9); opacity: 0.7; }
  70%  { transform: scale(1.3); opacity: 0; }
  100% { transform: scale(1.3); opacity: 0; }
}
`

function injectKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById('oc-chat-keyframes')) return
  const style = document.createElement('style')
  style.id = 'oc-chat-keyframes'
  style.textContent = KEYFRAMES
  document.head.appendChild(style)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// ─── Typing / loading dots ────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 2px' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--text-muted)',
            display: 'inline-block',
            animation: `oc-bounce 1.2s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Bot avatar ───────────────────────────────────────────────────────────────
function BotAvatar() {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        border: '1.5px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        marginTop: 2,
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      <span
        style={{
          fontFamily: 'monospace',
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.05em',
          color: 'var(--accent)',
          userSelect: 'none',
        }}
      >
        OC
      </span>
    </div>
  )
}

// ─── Single message bubble ────────────────────────────────────────────────────
function MessageBubble({ msg, isStreaming }: { msg: ChatMessage; isStreaming: boolean }) {
  const isUser = msg.role === 'user'
  const isEmpty = msg.content === '' && isStreaming

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        gap: 10,
        animation: 'oc-fade-in 0.22s ease-out both',
        maxWidth: '100%',
      }}
    >
      {/* Bot avatar — only for assistant */}
      {!isUser && <BotAvatar />}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
          maxWidth: '75%',
          gap: 4,
        }}
      >
        {/* Bubble */}
        <div
          style={{
            padding: isEmpty ? '10px 14px' : '10px 16px',
            borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
            background: isUser
              ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
              : 'var(--surface2)',
            color: isUser ? '#fff' : 'var(--text)',
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxShadow: isUser
              ? '0 2px 8px rgba(59,130,246,0.25)'
              : '0 1px 3px rgba(0,0,0,0.12)',
            border: isUser ? 'none' : '1px solid var(--border)',
            minWidth: isEmpty ? 'auto' : undefined,
          }}
        >
          {isEmpty ? <TypingDots /> : msg.content}
        </div>

        {/* Timestamp */}
        {!isEmpty && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              paddingLeft: isUser ? 0 : 2,
              paddingRight: isUser ? 2 : 0,
              userSelect: 'none',
            }}
          >
            {formatTime(msg.timestamp)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ name }: { name: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '40px 24px',
        userSelect: 'none',
      }}
    >
      {/* Icon */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '2px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: '0.05em',
              color: 'var(--accent)',
            }}
          >
            OC
          </span>
        </div>
        {/* Online ring */}
        <span
          style={{
            position: 'absolute',
            bottom: 3,
            right: 3,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#22c55e',
            border: '2px solid var(--bg)',
          }}
        />
      </div>

      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>
          Chat with {name}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          Send a message to start the conversation.
          <br />
          This session is saved locally.
        </p>
      </div>
    </div>
  )
}

// ─── Main ChatPanel ───────────────────────────────────────────────────────────
export function ChatPanel({ instance }: { instance: OpenClawInstance }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [sendHover, setSendHover] = useState(false)
  const [clearHover, setClearHover] = useState(false)

  // Inject keyframes once on mount
  useEffect(() => { injectKeyframes() }, [])

  // Load persisted history
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`chat:${instance.id}`)
      if (saved) setMessages(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [instance.id])

  // Persist & auto-scroll on message changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (messages.length > 0) {
      try {
        localStorage.setItem(`chat:${instance.id}`, JSON.stringify(messages.slice(-100)))
      } catch { /* ignore */ }
    }
  }, [messages, instance.id])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }

    const history = [...messages, userMsg]
    setMessages(history)
    setStreaming(true)

    const assistantId = crypto.randomUUID()
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, assistantPlaceholder])

    try {
      const res = await fetch(`/api/gateway/${instance.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openclaw',
          messages: history.map(m => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

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
          if (data === '[DONE]') break
          try {
            const chunk = JSON.parse(data)
            const delta = chunk.choices?.[0]?.delta?.content
            if (delta) {
              assembled += delta
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content: assembled } : m)
              )
            }
          } catch { /* skip malformed chunk */ }
        }
      }

      // Mark final timestamp
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId ? { ...m, timestamp: new Date().toISOString() } : m
        )
      )
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
                timestamp: new Date().toISOString(),
              }
            : m
        )
      )
    } finally {
      setStreaming(false)
    }
  }, [input, streaming, messages, instance.id])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
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

  const canSend = input.trim().length > 0 && !streaming

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg)',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          gap: 12,
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Left: avatar + name + badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {/* Mini avatar with online dot */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                border: '1.5px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: 10,
                  letterSpacing: '0.05em',
                  color: 'var(--accent)',
                  userSelect: 'none',
                }}
              >
                OC
              </span>
            </div>
            {/* Online dot */}
            <span
              style={{
                position: 'absolute',
                bottom: 1,
                right: 1,
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: '#22c55e',
                border: '2px solid var(--surface)',
              }}
            />
          </div>

          {/* Name + role */}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {instance.name}
            </div>
            {instance.role && (
              <div style={{ marginTop: 1 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                    background: 'var(--accent-dim)',
                    borderRadius: 4,
                    padding: '1px 6px',
                    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  }}
                >
                  {instance.role}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Clear button */}
        <button
          onClick={clearChat}
          onMouseEnter={() => setClearHover(true)}
          onMouseLeave={() => setClearHover(false)}
          title="Clear chat history"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: clearHover ? 'var(--surface2)' : 'transparent',
            color: clearHover ? 'var(--error)' : 'var(--text-muted)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
        >
          {/* Trash icon (inline SVG) */}
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
          Clear
        </button>
      </div>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: messages.length === 0 ? 0 : '20px 20px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          scrollBehavior: 'smooth',
        }}
      >
        {messages.length === 0 ? (
          <EmptyState name={instance.name} />
        ) : (
          messages.map((msg, idx) => {
            const isLastAssistant =
              idx === messages.length - 1 && msg.role === 'assistant'
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isStreaming={streaming && isLastAssistant}
              />
            )
          })
        )}
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      {/* ── Input area ─────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '12px 16px 16px',
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Input box */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '10px 12px 10px 16px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            transition: 'border-color 0.15s ease',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={autoResize}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${instance.name}…`}
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--text)',
              maxHeight: 160,
              minHeight: 22,
              fontFamily: 'inherit',
              padding: 0,
            }}
          />

          {/* Send button */}
          <button
            onClick={send}
            disabled={!canSend}
            onMouseEnter={() => setSendHover(true)}
            onMouseLeave={() => setSendHover(false)}
            title="Send message"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: canSend ? 'pointer' : 'not-allowed',
              background: canSend
                ? sendHover
                  ? '#2563eb'
                  : '#3b82f6'
                : 'var(--surface3)',
              color: canSend ? '#fff' : 'var(--text-dim)',
              transition: 'all 0.15s ease',
              boxShadow: canSend ? '0 2px 8px rgba(59,130,246,0.35)' : 'none',
              transform: canSend && sendHover ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            {/* Send icon (inline SVG) */}
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* Hint */}
        <p
          style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            textAlign: 'center',
            marginTop: 8,
            userSelect: 'none',
          }}
        >
          Enter to send&nbsp;&nbsp;·&nbsp;&nbsp;Shift + Enter for new line
        </p>
      </div>
    </div>
  )
}
