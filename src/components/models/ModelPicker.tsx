'use client'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Cpu, Check, ExternalLink } from 'lucide-react'

// ─── Curated model list ───────────────────────────────────────────────────────
// OpenRouter model IDs with display metadata. Add new models here as they ship.

export interface ModelDef {
  id: string               // full OpenRouter model ID
  label: string            // short display name
  provider: string         // Anthropic | OpenAI | Google | Meta | …
  tier: 'fast' | 'balanced' | 'powerful' | 'open'
  contextK: number         // context window in K tokens
  inputPer1M: number       // USD per 1M input tokens
  outputPer1M: number      // USD per 1M output tokens
  supportsTools: boolean
  supportsVision: boolean
  note?: string
}

export const MODELS: ModelDef[] = [
  // ── Auto-router ───────────────────────────────────────────────────────────
  {
    id: 'openrouter/auto',
    label: 'Auto (OpenRouter picks)',
    provider: 'OpenRouter',
    tier: 'balanced',
    contextK: 200,
    inputPer1M: 0,     // billed at whichever model runs
    outputPer1M: 0,
    supportsTools: true,
    supportsVision: true,
    note: 'Meta-router selects from ~38 models per prompt. Billed at the chosen model\'s rate.',
  },
  // ── Anthropic ─────────────────────────────────────────────────────────────
  {
    id: 'openrouter/anthropic/claude-opus-4-8',
    label: 'Claude Opus 4.8',
    provider: 'Anthropic',
    tier: 'powerful',
    contextK: 200,
    inputPer1M: 15,
    outputPer1M: 75,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'openrouter/anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    tier: 'balanced',
    contextK: 200,
    inputPer1M: 3,
    outputPer1M: 15,
    supportsTools: true,
    supportsVision: true,
    note: 'Recommended default — best quality/cost ratio',
  },
  {
    id: 'openrouter/anthropic/claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    tier: 'fast',
    contextK: 200,
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    supportsTools: true,
    supportsVision: true,
    note: 'Lowest cost Anthropic model. Good for classification and simple tasks.',
  },
  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    id: 'openrouter/openai/gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    tier: 'powerful',
    contextK: 128,
    inputPer1M: 2.5,
    outputPer1M: 10,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'openrouter/openai/gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'OpenAI',
    tier: 'fast',
    contextK: 128,
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    supportsTools: true,
    supportsVision: true,
    note: 'Cheapest OpenAI option. Good for simple chat and summaries.',
  },
  {
    id: 'openrouter/openai/o3',
    label: 'o3',
    provider: 'OpenAI',
    tier: 'powerful',
    contextK: 200,
    inputPer1M: 10,
    outputPer1M: 40,
    supportsTools: true,
    supportsVision: false,
    note: 'Reasoning model. Best for multi-step problem solving.',
  },
  // ── Google ────────────────────────────────────────────────────────────────
  {
    id: 'openrouter/google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    tier: 'powerful',
    contextK: 1000,
    inputPer1M: 1.25,
    outputPer1M: 10,
    supportsTools: true,
    supportsVision: true,
    note: '1M context window — best for very long documents.',
  },
  {
    id: 'openrouter/google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    tier: 'fast',
    contextK: 1000,
    inputPer1M: 0.075,
    outputPer1M: 0.30,
    supportsTools: true,
    supportsVision: true,
    note: 'Extremely cheap with 1M context. Good for document-heavy tasks.',
  },
  // ── Open source ───────────────────────────────────────────────────────────
  {
    id: 'openrouter/meta-llama/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B',
    provider: 'Meta',
    tier: 'open',
    contextK: 128,
    inputPer1M: 0.12,
    outputPer1M: 0.30,
    supportsTools: true,
    supportsVision: false,
    note: 'Best open-source model. Good tool-use support.',
  },
  {
    id: 'openrouter/deepseek/deepseek-r1',
    label: 'DeepSeek R1',
    provider: 'DeepSeek',
    tier: 'powerful',
    contextK: 64,
    inputPer1M: 0.55,
    outputPer1M: 2.19,
    supportsTools: false,
    supportsVision: false,
    note: 'Reasoning model comparable to o1. Very low cost.',
  },
]

const TIER_COLOR: Record<ModelDef['tier'], string> = {
  fast:     'rgba(34,197,94,0.15)',
  balanced: 'rgba(59,130,246,0.15)',
  powerful: 'rgba(168,85,247,0.15)',
  open:     'rgba(245,158,11,0.15)',
}
const TIER_LABEL_COLOR: Record<ModelDef['tier'], string> = {
  fast:     '#22c55e',
  balanced: '#60a5fa',
  powerful: '#a855f7',
  open:     '#f59e0b',
}

function formatCost(n: number): string {
  if (n === 0) return 'auto'
  if (n < 1) return `$${n.toFixed(3)}`
  return `$${n.toFixed(2)}`
}

// ─── Exported picker ──────────────────────────────────────────────────────────

export function ModelPicker({
  value,
  onChange,
  size = 'normal',
  showDetails = true,
}: {
  value: string
  onChange: (id: string) => void
  size?: 'normal' | 'compact'
  showDetails?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const current = MODELS.find(m => m.id === value)
  const displayLabel = current?.label ?? (value || 'No model set')

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isCompact = size === 'compact'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: isCompact ? '4px 10px' : '7px 12px',
          borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface2)', cursor: 'pointer',
          fontSize: isCompact ? 11 : 13, color: 'var(--text)',
          whiteSpace: 'nowrap',
        }}
      >
        <Cpu size={isCompact ? 11 : 13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ maxWidth: isCompact ? 140 : 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayLabel}</span>
        <ChevronDown size={isCompact ? 10 : 12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)', minWidth: 340, maxWidth: 420,
          maxHeight: 480, overflow: 'auto',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)' }}>
            Select Model
          </div>

          {/* Model list */}
          {MODELS.map(m => {
            const isSelected = value === m.id
            return (
              <div
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false) }}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  background: isSelected ? 'var(--accent-dim)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showDetails ? 4 : 0 }}>
                  {/* Tier badge */}
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: TIER_COLOR[m.tier], color: TIER_LABEL_COLOR[m.tier], fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>
                    {m.tier}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? 'var(--accent)' : 'var(--text)', flex: 1 }}>{m.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{m.provider}</span>
                  {isSelected && <Check size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                </div>
                {showDetails && (
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-dim)', marginTop: 2, flexWrap: 'wrap' }}>
                    <span>{m.contextK}K ctx</span>
                    <span>in: {formatCost(m.inputPer1M)}/1M</span>
                    <span>out: {formatCost(m.outputPer1M)}/1M</span>
                    {m.supportsTools && <span style={{ color: 'var(--success)', fontSize: 10 }}>⚙ tools</span>}
                    {m.supportsVision && <span style={{ color: 'var(--success)', fontSize: 10 }}>👁 vision</span>}
                  </div>
                )}
                {showDetails && m.note && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, fontStyle: 'italic', opacity: 0.8 }}>{m.note}</div>
                )}
              </div>
            )
          })}

          {/* Custom model input */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 600 }}>Custom model ID</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={custom}
                onChange={e => setCustom(e.target.value)}
                placeholder="openrouter/provider/model-name"
                onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { onChange(custom.trim()); setOpen(false); setCustom('') } }}
                style={{ flex: 1, fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'monospace' }}
              />
              <button
                onClick={() => { if (custom.trim()) { onChange(custom.trim()); setOpen(false); setCustom('') } }}
                style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
              >
                Use
              </button>
            </div>
            <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent)', marginTop: 6, textDecoration: 'none', opacity: 0.8 }}>
              <ExternalLink size={10} /> Browse all models on OpenRouter
            </a>
          </div>

          {/* Clear */}
          {value && (
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => { onChange(''); setOpen(false) }}
                style={{ fontSize: 12, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                ✕ Clear (use agent default)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
