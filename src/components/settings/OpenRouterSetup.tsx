'use client'
import { useState, useEffect, useCallback } from 'react'
import { sshExec } from '@/lib/utils'
import type { OpenClawInstance } from '@/types'

interface ORStatus {
  has_profile: boolean
  has_key: boolean
}

export function OpenRouterSetup({ instance }: { instance: OpenClawInstance }) {
  const [status, setStatus] = useState<ORStatus | null>(null)
  const [checking, setChecking] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [applying, setApplying] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const checkStatus = useCallback(async () => {
    setChecking(true)
    try {
      const wp = instance.workspacePath
      const raw = await sshExec(instance.id, `python3 - <<'PYEOF'
import json
from pathlib import Path
wp = Path('${wp}')
try:
    cfg = json.loads((wp / 'openclaw.json').read_text())
    has_profile = 'openrouter:default' in cfg.get('auth', {}).get('profiles', {})
except Exception:
    has_profile = False
env_file = wp / '.env-gateway'
has_key = False
if env_file.exists():
    has_key = any(
        l.startswith('OPENROUTER_API_KEY=') and len(l.split('=', 1)[-1].strip()) > 0
        for l in env_file.read_text().splitlines()
    )
print(json.dumps({'has_profile': has_profile, 'has_key': has_key}))
PYEOF`)
      const trimmed = raw.trim()
      const start = trimmed.lastIndexOf('{')
      if (start !== -1) setStatus(JSON.parse(trimmed.slice(start)))
      else setStatus({ has_profile: false, has_key: false })
    } catch {
      setStatus(null)
    } finally {
      setChecking(false)
    }
  }, [instance.id, instance.workspacePath])

  useEffect(() => { checkStatus() }, [checkStatus])

  async function apply() {
    const key = apiKey.trim()
    if (!key) return
    setApplying(true)
    setResult(null)
    try {
      const wp = instance.workspacePath
      // Base64-encode key so it's safe to embed in heredoc (no shell-special chars)
      const b64 = btoa(key)
      const raw = await sshExec(instance.id, `python3 - <<'PYEOF'
import json, base64
from pathlib import Path

wp = Path('${wp}')
api_key = base64.b64decode('${b64}').decode()

# Add openrouter:default profile to openclaw.json
cfg_file = wp / 'openclaw.json'
cfg = json.loads(cfg_file.read_text())
if 'auth' not in cfg:
    cfg['auth'] = {}
if 'profiles' not in cfg['auth']:
    cfg['auth']['profiles'] = {}
cfg['auth']['profiles']['openrouter:default'] = {
    'provider': 'openrouter',
    'mode': 'api_key',
}
cfg_file.write_text(json.dumps(cfg, indent=2))

# Write OPENROUTER_API_KEY to .env-gateway (preserve all other lines)
env_file = wp / '.env-gateway'
existing = env_file.read_text().splitlines() if env_file.exists() else []
lines = [l for l in existing if not l.startswith('OPENROUTER_API_KEY=')]
lines.append(f'OPENROUTER_API_KEY={api_key}')
env_file.write_text('\\n'.join(lines) + '\\n')

print(json.dumps({'ok': True}))
PYEOF`)
      const trimmed = raw.trim()
      const start = trimmed.lastIndexOf('{')
      const parsed = start !== -1 ? JSON.parse(trimmed.slice(start)) : { ok: false }
      if (parsed.ok) {
        setResult({ ok: true, msg: 'OpenRouter configured — restart the gateway to activate.' })
        setApiKey('')
        await checkStatus()
      } else {
        setResult({ ok: false, msg: 'Script completed but returned unexpected output.' })
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Failed to apply' })
    } finally {
      setApplying(false)
    }
  }

  async function restartGateway() {
    setRestarting(true)
    try {
      const res = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setResult({ ok: true, msg: 'Gateway restarted — OpenRouter is now active.' })
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Restart failed' })
    } finally {
      setRestarting(false)
    }
  }

  const isConfigured = status?.has_profile && status?.has_key

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {checking ? (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Checking agent config…</span>
        ) : status === null ? (
          <span style={{ fontSize: 12, color: 'var(--error)' }}>SSH error — cannot read agent config</span>
        ) : (
          <>
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 700, letterSpacing: '0.04em',
              background: isConfigured ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
              color: isConfigured ? 'var(--success)' : 'var(--warning)',
              border: `1px solid ${isConfigured ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
            }}>
              {isConfigured ? '✓ CONFIGURED' : 'NOT CONFIGURED'}
            </span>
            {status.has_profile && !status.has_key && (
              <span style={{ fontSize: 11, color: 'var(--warning)' }}>Profile added · API key missing</span>
            )}
            {isConfigured && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                auth profile + API key found in agent's .env-gateway
              </span>
            )}
          </>
        )}

        <button
          onClick={checkStatus}
          disabled={checking}
          style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', opacity: checking ? 0.5 : 1 }}
        >
          Refresh
        </button>
      </div>

      {/* API key input */}
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>
          OpenRouter API Key
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') apply() }}
              placeholder={isConfigured ? '● ● ● ● ● (key set — enter new to replace)' : 'sk-or-v1-…'}
              style={{ width: '100%', paddingRight: 36, boxSizing: 'border-box' }}
            />
            <button
              onClick={() => setShowKey(s => !s)}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2, fontSize: 11 }}
              tabIndex={-1}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
          <button
            onClick={apply}
            disabled={applying || !apiKey.trim()}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 500,
              background: applying || !apiKey.trim() ? 'var(--surface3)' : 'var(--accent)',
              color: applying || !apiKey.trim() ? 'var(--text-dim)' : 'white',
              cursor: applying || !apiKey.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', transition: 'background 0.15s',
            }}
          >
            {applying ? 'Applying…' : 'Apply to Agent'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.6 }}>
          Writes to <code style={{ fontFamily: 'monospace', fontSize: 10 }}>.env-gateway</code> on the agent VM and registers an <code style={{ fontFamily: 'monospace', fontSize: 10 }}>openrouter:default</code> auth profile.
          Get your key at{' '}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            openrouter.ai/keys
          </a>
        </p>
      </div>

      {/* Result / restart */}
      {result && (
        <div style={{
          fontSize: 12, padding: '10px 14px', borderRadius: 8,
          background: result.ok ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
          color: result.ok ? 'var(--success)' : 'var(--error)',
          border: `1px solid ${result.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>{result.msg}</span>
          {result.ok && !result.msg.includes('restarted') && (
            <button
              onClick={restartGateway}
              disabled={restarting}
              style={{
                padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 11,
                cursor: restarting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                opacity: restarting ? 0.6 : 1,
              }}
            >
              {restarting ? 'Restarting…' : 'Restart Gateway'}
            </button>
          )}
        </div>
      )}

      {/* How it works */}
      {!isConfigured && !checking && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>How to use after setup</p>
          <ol style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Enter your OpenRouter API key above → Apply to Agent</li>
            <li>Restart the gateway when prompted</li>
            <li>In instance settings → Model Routing, pick an OpenRouter model (e.g. <code style={{ fontSize: 11 }}>openrouter/anthropic/claude-sonnet-4-6</code>)</li>
            <li>All chats from this panel will route through OpenRouter</li>
          </ol>
        </div>
      )}
    </div>
  )
}
