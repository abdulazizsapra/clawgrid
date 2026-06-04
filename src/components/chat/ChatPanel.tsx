'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, Trash2, Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OpenClawInstance, ChatMessage } from '@/types'

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: isUser ? 'var(--accent)' : 'var(--surface2)' }}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div
        className="max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
        style={{
          background: isUser ? 'var(--accent)' : 'var(--surface2)',
          color: 'var(--text)',
        }}
      >
        {msg.content}
      </div>
    </div>
  )
}

export function ChatPanel({ instance }: { instance: OpenClawInstance }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(`chat:${instance.id}`)
    if (saved) setMessages(JSON.parse(saved))
  }, [instance.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (messages.length > 0) {
      localStorage.setItem(`chat:${instance.id}`, JSON.stringify(messages.slice(-100)))
    }
  }, [messages, instance.id])

  async function send() {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    textareaRef.current!.style.height = 'auto'

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setStreaming(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() }])

    try {
      const res = await fetch(`/api/gateway/${instance.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          messages: updated.map(m => ({ role: m.role, content: m.content })),
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
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setMessages(prev =>
        prev.map(m => m.id === assistantId
          ? { ...m, content: `Error: ${e instanceof Error ? e.message : 'unknown error'}` }
          : m
        )
      )
    } finally {
      setStreaming(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <div
        className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <span className="font-semibold">{instance.name}</span>
          <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{instance.role}</span>
        </div>
        <button
          onClick={() => { setMessages([]); localStorage.removeItem(`chat:${instance.id}`) }}
          className="transition-colors p-1.5 rounded"
          style={{ color: 'var(--text-muted)' }}
          title="Clear chat"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <div className="text-center">
              <Bot size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Send a message to start chatting with {instance.name}</p>
            </div>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        {streaming && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface2)' }}>
              <Bot size={13} />
            </div>
            <div className="flex items-center gap-1 px-4 py-2.5 rounded-xl" style={{ background: 'var(--surface2)' }}>
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <div
          className="flex items-end gap-3 rounded-xl p-3"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={autoResize}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${instance.name}…`}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed"
            style={{ color: 'var(--text)', maxHeight: '160px' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0"
            style={{
              background: input.trim() && !streaming ? 'var(--accent)' : 'var(--border)',
              color: 'white',
            }}
          >
            <Send size={13} />
          </button>
        </div>
        <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
