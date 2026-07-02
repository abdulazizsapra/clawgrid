'use client'
import { useState, useCallback } from 'react'
import { sshExec } from '@/lib/utils'
import { ModelPicker, MODELS } from '@/components/models/ModelPicker'
import type { OpenClawInstance } from '@/types'

// ─── Provider catalogue ───────────────────────────────────────────────────────

type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'groq' | 'together' | 'custom'

interface Provider {
  id: ProviderId
  label: string
  envKey: string
  baseUrl: string
  hint: string
  color: string
  profileProvider: string     // what goes in openclaw.json auth.profile.provider
  supportsOpenRouterFallbacks?: boolean
}

const PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    hint: 'Direct Anthropic API — claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5',
    color: '#d97706',
    profileProvider: 'anthropic',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    hint: '300+ models via a single API key. Best for cost routing + fallbacks.',
    color: '#7c3aed',
    profileProvider: 'openrouter',
    supportsOpenRouterFallbacks: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    hint: 'GPT-4o, GPT-4o-mini, o3 — direct OpenAI API',
    color: '#059669',
    profileProvider: 'openai',
  },
  {
    id: 'groq',
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    hint: 'Ultra-fast inference — Llama 3.3 70B, Gemma 2, Mixtral',
    color: '#0284c7',
    profileProvider: 'openai',
  },
  {
    id: 'together',
    label: 'Together AI',
    envKey: 'TOGETHER_API_KEY',
    baseUrl: 'https://api.together.xyz/v1',
    hint: 'Open-source models — Llama, Qwen, DeepSeek, Mixtral',
    color: '#db2777',
    profileProvider: 'openai',
  },
  {
    id: 'custom',
    label: 'Custom',
    envKey: 'CUSTOM_API_KEY',
    baseUrl: '',
    hint: 'Any OpenAI-compatible endpoint — local Ollama, LM Studio, vLLM, etc.',
    color: '#6b7280',
    profileProvider: 'openai',
  },
]

// ─── Per-instance card ────────────────────────────────────────────────────────

interface CardState {
  // Panel-side (instance registry)
  provider: ProviderId | ''
  customBaseUrl: string
  defaultModel: string
  fallbacks: string
  // Agent-side (SSH)
  apiKey: string
  showKey: boolean
  // Status
  agentStatus: { configured: boolean; provider?: string } | null
  agentChecking: boolean
  applying: boolean
  saving: boolean
  saveDone: boolean
  applyResult: { ok: boolean; msg: string } | null
}

function InstanceRoutingCard({ instance }: { instance: OpenClawInstance }) {
  const initProvider = (instance.routingProvider ?? '') as ProviderId | ''

  const [s, setS] = useState<CardState>({
    provider: initProvider,
    customBaseUrl: instance.routingCustomBaseUrl ?? '',
    defaultModel: instance.defaultModel ?? '',
    fallbacks: (instance.modelFallbacks ?? []).join(', '),
    apiKey: '',
    showKey: false,
    agentStatus: null,
    agentChecking: false,
    applying: false,
    saving: false,
    saveDone: false,
    applyResult: null,
  })

  const upd = (patch: Partial<CardState>) => setS(prev => ({ ...prev, ...patch }))

  const providerDef = PROVIDERS.find(p => p.id === s.provider)

  // ── Check current agent config ──
  const checkAgent = useCallback(async () => {
    upd({ agentChecking: true, agentStatus: null })
    try {
      const b64Wp = btoa(unescape(encodeURIComponent(instance.workspacePath)))
      const raw = await sshExec(instance.id, `python3 - <<'PYEOF'
import json, base64
from pathlib import Path
wp = Path(base64.b64decode('${b64Wp}').decode())
try:
    cfg = json.loads((wp / 'openclaw.json').read_text())
    profiles = cfg.get('auth', {}).get('profiles', {})
    providers_configured = [p.get('provider', k.split(':')[0]) for k, p in profiles.items()]
    env_file = wp / '.env-gateway'
    env_keys = []
    if env_file.exists():
        env_keys = [l.split('=')[0] for l in env_file.read_text().splitlines() if '=' in l and len(l.split('=',1)[1].strip()) > 0]
    print(json.dumps({'ok': True, 'profiles': list(profiles.keys()), 'env_keys': env_keys}))
except Exception as e:
    print(json.dumps({'ok': False, 'error': str(e)}))
PYEOF`)
      const trimmed = raw.trim()
      const start = trimmed.lastIndexOf('{')
      if (start === -1) { upd({ agentStatus: { configured: false }, agentChecking: false }); return }
      const parsed = JSON.parse(trimmed.slice(start))
      upd({
        agentStatus: {
          configured: parsed.ok && parsed.profiles?.length > 0,
          provider: parsed.profiles?.[0]?.split(':')[0] ?? '',
        },
        agentChecking: false,
      })
    } catch {
      upd({ agentStatus: { configured: false }, agentChecking: false })
    }
  }, [instance.id, instance.workspacePath])

  // ── Apply to agent ──
  async function applyToAgent() {
    const key = s.apiKey.trim()
    if (!key || !s.provider) return
    upd({ applying: true, applyResult: null })
    try {
      const pDef = PROVIDERS.find(p => p.id === s.provider)!
      const b64Wp = btoa(unescape(encodeURIComponent(instance.workspacePath)))
      const b64Key = btoa(unescape(encodeURIComponent(key)))
      const profileName = `${s.provider}:default`
      const profileJson = JSON.stringify({
        provider: pDef.profileProvider,
        mode: 'api_key',
        ...(s.provider === 'custom' && s.customBaseUrl ? { baseUrl: s.customBaseUrl } : {}),
        ...(s.provider === 'groq' ? { baseUrl: 'https://api.groq.com/openai/v1' } : {}),
        ...(s.provider === 'together' ? { baseUrl: 'https://api.together.xyz/v1' } : {}),
        ...(s.provider === 'openrouter' ? { baseUrl: 'https://openrouter.ai/api/v1' } : {}),
      })
      const envKey = pDef.envKey
      const raw = await sshExec(instance.id, `python3 - <<'PYEOF'
import json, base64
from pathlib import Path

wp = Path(base64.b64decode('${b64Wp}').decode())
api_key = base64.b64decode('${b64Key}').decode()
profile_name = '${profileName}'
profile_data = ${profileJson}
env_key = '${envKey}'

# Update openclaw.json auth profiles
cfg_file = wp / 'openclaw.json'
cfg = json.loads(cfg_file.read_text())
if 'auth' not in cfg: cfg['auth'] = {}
if 'profiles' not in cfg['auth']: cfg['auth']['profiles'] = {}
cfg['auth']['profiles'][profile_name] = profile_data
cfg_file.write_text(json.dumps(cfg, indent=2))

# Update .env-gateway (preserve all other lines)
env_file = wp / '.env-gateway'
existing = env_file.read_text().splitlines() if env_file.exists() else []
lines = [l for l in existing if not l.startswith(env_key + '=')]
lines.append(f'{env_key}={api_key}')
env_file.write_text('\\n'.join(lines) + '\\n')

print(json.dumps({'ok': True}))
PYEOF`)
      const trimmed = raw.trim()
      const start = trimmed.lastIndexOf('{')
      const parsed = start !== -1 ? JSON.parse(trimmed.slice(start)) : { ok: false }
      upd({
        applying: false,
        apiKey: '',
        applyResult: { ok: parsed.ok, msg: parsed.ok ? 'Applied to agent — restart gateway to activate.' : 'Script error.' },
      })
      if (parsed.ok) checkAgent()
    } catch (e) {
      upd({ applying: false, applyResult: { ok: false, msg: e instanceof Error ? e.message : 'Failed' } })
    }
  }

  // ── Restart gateway ──
  async function restartGateway() {
    try {
      const res = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      upd({ applyResult: { ok: true, msg: 'Gateway restarted.' } })
    } catch (e) {
      upd({ applyResult: { ok: false, msg: e instanceof Error ? e.message : 'Restart failed' } })
    }
  }

  // ── Save panel-side routing (registry) ──
  async function savePanel() {
    upd({ saving: true, saveDone: false })
    try {
      const payload: Partial<OpenClawInstance> = {
        ...instance,
        routingProvider: s.provider || undefined,
        routingCustomBaseUrl: s.provider === 'custom' ? s.customBaseUrl : undefined,
        defaultModel: s.defaultModel || undefined,
        modelFallbacks: s.fallbacks ? s.fallbacks.split(',').map(x => x.trim()).filter(Boolean) : undefined,
      }
      const res = await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      upd({ saving: false, saveDone: true })
      setTimeout(() => upd({ saveDone: false }), 2500)
    } catch (e) {
      upd({ saving: false, applyResult: { ok: false, msg: e instanceof Error ? e.message : 'Save failed' } })
    }
  }

  const isOnline = instance.status === 'online'

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            🤖
          </div>
          <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: isOnline ? 'var(--success)' : 'var(--error)', border: '2px solid var(--surface2)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instance.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            <code style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '1px 5px', borderRadius: 3 }}>{instance.id}</code>
            {instance.role && <span style={{ marginLeft: 6 }}>{instance.role}</span>}
          </div>
        </div>
        {/* Active provider badge */}
        {s.provider && (
          <span style={{
            fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
            background: `${PROVIDERS.find(p => p.id === s.provider)?.color ?? '#6b7280'}20`,
            color: PROVIDERS.find(p => p.id === s.provider)?.color ?? '#6b7280',
            border: `1px solid ${PROVIDERS.find(p => p.id === s.provider)?.color ?? '#6b7280'}40`,
          }}>
            {PROVIDERS.find(p => p.id === s.provider)?.label}
          </span>
        )}
      </div>

      <div style={{ flex: 1, padding: '18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Provider selection ── */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Provider
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => upd({ provider: p.id })}
                style={{
                  padding: '8px 6px', borderRadius: 8, border: `1.5px solid ${s.provider === p.id ? p.color : 'var(--border)'}`,
                  background: s.provider === p.id ? `${p.color}15` : 'var(--surface2)',
                  color: s.provider === p.id ? p.color : 'var(--text-muted)',
                  fontSize: 12, fontWeight: s.provider === p.id ? 700 : 400,
                  cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {providerDef && (
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.6 }}>{providerDef.hint}</p>
          )}
          {s.provider === 'custom' && (
            <input
              type="text"
              value={s.customBaseUrl}
              onChange={e => upd({ customBaseUrl: e.target.value })}
              placeholder="https://localhost:11434/v1"
              style={{ marginTop: 8, width: '100%', boxSizing: 'border-box' }}
            />
          )}
        </div>

        {/* ── Model + fallbacks (panel-side) ── */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Default Model <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0 }}>— injected per-request by panel</span>
          </label>
          <ModelPicker
            value={s.defaultModel}
            onChange={v => upd({ defaultModel: v })}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Fallback Models <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0 }}>— comma-separated (OpenRouter routes through these in order)</span>
          </label>
          <input
            type="text"
            value={s.fallbacks}
            onChange={e => upd({ fallbacks: e.target.value })}
            placeholder="openrouter/anthropic/claude-haiku-4-5, openrouter/openai/gpt-4o-mini"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Save panel settings */}
        <button
          onClick={savePanel}
          disabled={s.saving}
          style={{
            padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 500,
            background: s.saveDone ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
            color: s.saveDone ? 'var(--success)' : 'white',
            cursor: s.saving ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
          }}
        >
          {s.saving ? 'Saving…' : s.saveDone ? '✓ Saved' : 'Save Routing Config'}
        </button>

        {/* ── Divider ── */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Apply to Agent <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: 0 }}>— writes API key to agent's .env-gateway via SSH</span>
          </label>

          {/* Agent status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {s.agentStatus === null && !s.agentChecking && (
              <button
                onClick={checkAgent}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Check agent config
              </button>
            )}
            {s.agentChecking && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Checking…</span>}
            {s.agentStatus && !s.agentChecking && (
              <>
                <span style={{
                  fontSize: 11, padding: '2px 9px', borderRadius: 20, fontWeight: 600,
                  background: s.agentStatus.configured ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                  color: s.agentStatus.configured ? 'var(--success)' : 'var(--warning)',
                  border: `1px solid ${s.agentStatus.configured ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
                }}>
                  {s.agentStatus.configured ? '✓ Agent configured' : 'Agent not configured'}
                </span>
                <button
                  onClick={checkAgent}
                  style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer' }}
                >
                  Refresh
                </button>
              </>
            )}
          </div>

          {/* API key input */}
          {s.provider && (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={s.showKey ? 'text' : 'password'}
                  value={s.apiKey}
                  onChange={e => upd({ apiKey: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') applyToAgent() }}
                  placeholder={s.agentStatus?.configured ? '● ● ● ● (enter new key to replace)' : `${providerDef?.envKey ?? 'API_KEY'}=…`}
                  style={{ width: '100%', paddingRight: 32, boxSizing: 'border-box' }}
                />
                <button
                  onClick={() => upd({ showKey: !s.showKey })}
                  tabIndex={-1}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 11 }}
                >
                  {s.showKey ? '🙈' : '👁'}
                </button>
              </div>
              <button
                onClick={applyToAgent}
                disabled={s.applying || !s.apiKey.trim()}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 500,
                  background: s.applying || !s.apiKey.trim() ? 'var(--surface3)' : 'var(--accent)',
                  color: s.applying || !s.apiKey.trim() ? 'var(--text-dim)' : 'white',
                  cursor: s.applying || !s.apiKey.trim() ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.applying ? 'Applying…' : 'Apply to Agent'}
              </button>
            </div>
          )}
          {!s.provider && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>Select a provider above to apply an API key to this agent.</p>
          )}
        </div>

        {/* Apply result */}
        {s.applyResult && (
          <div style={{
            fontSize: 12, padding: '9px 13px', borderRadius: 8,
            background: s.applyResult.ok ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
            color: s.applyResult.ok ? 'var(--success)' : 'var(--error)',
            border: `1px solid ${s.applyResult.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <span>{s.applyResult.msg}</span>
            {s.applyResult.ok && s.applyResult.msg.includes('restart') && (
              <button
                onClick={restartGateway}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Restart Gateway
              </button>
            )}
          </div>
        )}

        {/* Model cost reference */}
        {s.defaultModel && (() => {
          const m = MODELS.find(x => x.id === s.defaultModel)
          if (!m) return null
          return (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 14px', display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11 }}>
              <span><strong style={{ color: 'var(--text)' }}>Context</strong> <span style={{ color: 'var(--text-dim)' }}>{m.contextK}K</span></span>
              <span><strong style={{ color: 'var(--text)' }}>Input</strong> <span style={{ color: 'var(--text-dim)' }}>${m.inputPer1M}/1M</span></span>
              <span><strong style={{ color: 'var(--text)' }}>Output</strong> <span style={{ color: 'var(--text-dim)' }}>${m.outputPer1M}/1M</span></span>
              {!m.supportsTools && <span style={{ color: 'var(--warning)' }}>⚠ No tool use</span>}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ModelRoutingPanel({ instances }: { instances: OpenClawInstance[] }) {
  return (
    <div style={{ padding: 28, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>Model Routing</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Configure the AI provider and model for each agent. <strong>Save Routing Config</strong> sets what the panel injects per request.
          <strong> Apply to Agent</strong> writes the API key to the agent's config via SSH so autonomous tasks use the same provider.
        </p>
      </div>

      {/* Instance grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(instances.length, 3)}, minmax(300px, 1fr))`,
        gap: 20,
        alignItems: 'start',
      }}>
        {instances.map(inst => (
          <InstanceRoutingCard key={inst.id} instance={inst} />
        ))}
      </div>

      {instances.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          No instances registered. Add one via the <a href="/instances/new" style={{ color: 'var(--accent)' }}>+ New Instance</a> page.
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 28, padding: '14px 18px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Provider Reference</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {PROVIDERS.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 200, flex: '1 1 200px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0, marginTop: 3 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{p.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>{p.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
