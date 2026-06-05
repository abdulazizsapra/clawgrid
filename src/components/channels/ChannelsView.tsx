'use client'
import { sshExec } from '@/lib/utils'
import { useState, useEffect, useCallback } from 'react'
import {
  Radio, RefreshCw, Plus, X, Eye, EyeOff, Save,
  CheckCircle, AlertCircle, Settings, ChevronRight, Users, Trash2
} from 'lucide-react'
import type { OpenClawInstance } from '@/types'

// ─── Channel definitions ──────────────────────────────────────────────────────

const CHANNEL_META: Record<string, {
  label: string; icon: string; color: string; bg: string
  description: string
  fields: FieldDef[]
}> = {
  slack: {
    label: 'Slack', icon: '💬', color: '#4A154B', bg: 'rgba(74,21,75,0.12)',
    description: 'Connect via Slack Socket Mode or Webhooks. Supports DMs, channels, and mentions.',
    fields: [
      { key: 'mode', label: 'Connection Mode', type: 'select', options: ['socket', 'webhook'], help: 'Socket mode is recommended for real-time communication.' },
      { key: 'botToken', label: 'Bot Token', type: 'secret', placeholder: 'xoxb-...', help: 'Found in your Slack app credentials under OAuth & Permissions.' },
      { key: 'appToken', label: 'App-Level Token', type: 'secret', placeholder: 'xapp-...', help: 'Required for Socket Mode. Found under Basic Information → App-Level Tokens.' },
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'requireMention', label: 'Require @mention', type: 'toggle', help: 'Only respond when directly @mentioned in channels.' },
      { key: 'dmPolicy', label: 'DM Policy', type: 'select', options: ['allowlist', 'all', 'none'], help: 'Who can start a DM with the agent.' },
      { key: 'groupPolicy', label: 'Channel Policy', type: 'select', options: ['allowlist', 'all', 'none'], help: 'Which channels the agent responds in.' },
      { key: 'allowFrom', label: 'Allowed User IDs', type: 'list', placeholder: 'U0XXXXX', help: 'Slack user IDs allowed to interact. Find yours via Slack profile → More → Copy member ID.' },
    ],
  },
  telegram: {
    label: 'Telegram', icon: '✈️', color: '#229ED9', bg: 'rgba(34,158,217,0.12)',
    description: 'Connect via Telegram Bot API. DMs and group chats supported.',
    fields: [
      { key: 'token', label: 'Bot Token', type: 'secret', placeholder: '1234567890:AAAA...', help: 'Get a bot token from @BotFather on Telegram.' },
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'allowFrom', label: 'Allowed Chat IDs', type: 'list', placeholder: '123456789', help: 'Telegram user or group chat IDs allowed to interact.' },
      { key: 'requireMention', label: 'Require @mention in groups', type: 'toggle' },
    ],
  },
  discord: {
    label: 'Discord', icon: '🎮', color: '#5865F2', bg: 'rgba(88,101,242,0.12)',
    description: 'Connect via Discord Bot. Supports server channels and DMs.',
    fields: [
      { key: 'token', label: 'Bot Token', type: 'secret', placeholder: 'MTI...', help: 'Get a bot token from Discord Developer Portal → Bot.' },
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'guildIds', label: 'Server (Guild) IDs', type: 'list', placeholder: '1234567890', help: 'Discord server IDs where the bot is active.' },
      { key: 'requireMention', label: 'Require @mention', type: 'toggle' },
    ],
  },
  whatsapp: {
    label: 'WhatsApp', icon: '📱', color: '#25D366', bg: 'rgba(37,211,102,0.12)',
    description: 'Connect via WhatsApp Business API.',
    fields: [
      { key: 'token', label: 'Access Token', type: 'secret', placeholder: 'EAA...', help: 'Get from Meta for Developers → WhatsApp → API Setup.' },
      { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text', placeholder: '1234567890' },
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'allowFrom', label: 'Allowed Phone Numbers', type: 'list', placeholder: '+61400000000' },
    ],
  },
  email: {
    label: 'Email', icon: '📧', color: '#EA4335', bg: 'rgba(234,67,53,0.12)',
    description: 'Send and receive emails via Gmail or SMTP.',
    fields: [
      { key: 'address', label: 'Email Address', type: 'text', placeholder: 'agent@example.com' },
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
    ],
  },
  browser: {
    label: 'Web Interface', icon: '🌐', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',
    description: 'Built-in web chat interface at the gateway URL.',
    fields: [
      { key: 'enabled', label: 'Enabled', type: 'toggle' },
      { key: 'path', label: 'URL Path', type: 'text', placeholder: '/chat' },
    ],
  },
}

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'secret' | 'toggle' | 'select' | 'list'
  placeholder?: string
  help?: string
  options?: string[]
}


// ─── Field renderer ───────────────────────────────────────────────────────────

function FieldEditor({ def, value, onChange }: {
  def: FieldDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  const [revealed, setRevealed] = useState(false)

  const base: React.CSSProperties = {
    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  if (def.type === 'toggle') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => onChange(!value)}
          style={{
            width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
            background: value ? 'var(--accent)' : 'var(--surface3)',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: 3, left: value ? 20 : 3,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s',
          }} />
        </button>
        <span style={{ fontSize: 13, color: value ? 'var(--success)' : 'var(--text-muted)' }}>
          {value ? 'Enabled' : 'Disabled'}
        </span>
      </div>
    )
  }

  if (def.type === 'select') {
    return (
      <select
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        style={{ ...base, cursor: 'pointer' }}
      >
        {def.options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (def.type === 'secret') {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type={revealed ? 'text' : 'password'}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={def.placeholder}
          style={{ ...base, fontFamily: revealed ? 'inherit' : 'monospace', flex: 1 }}
        />
        <button
          onClick={() => setRevealed(r => !r)}
          style={{ padding: '0 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0 }}
        >
          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    )
  }

  if (def.type === 'list') {
    const arr = Array.isArray(value) ? (value as string[]) : []
    const [draft, setDraft] = useState('')
    return (
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) { onChange([...arr, draft.trim()]); setDraft('') } }}
            placeholder={def.placeholder ?? 'Add item…'}
            style={{ ...base, flex: 1 }}
          />
          <button
            onClick={() => { if (draft.trim()) { onChange([...arr, draft.trim()]); setDraft('') } }}
            style={{ padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--accent)', flexShrink: 0 }}
          >
            <Plus size={13} />
          </button>
        </div>
        {arr.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {arr.map((item, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 8px 3px 10px', borderRadius: 20, background: 'var(--surface3)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{item}</code>
                <button onClick={() => onChange(arr.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0, display: 'flex', lineHeight: 1 }}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        {arr.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>No entries — press Enter to add</div>}
      </div>
    )
  }

  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      placeholder={def.placeholder}
      style={base}
    />
  )
}

// ─── Channel config panel ─────────────────────────────────────────────────────

function ChannelConfig({ channelKey, config, meta, onSave, onDelete, saving }: {
  channelKey: string
  config: Record<string, unknown>
  meta: typeof CHANNEL_META[string]
  onSave: (key: string, data: Record<string, unknown>) => void
  onDelete: (key: string) => void
  saving: boolean
}) {
  const [local, setLocal] = useState<Record<string, unknown>>({ ...config })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isDirty = JSON.stringify(local) !== JSON.stringify(config)

  function set(key: string, val: unknown) {
    setLocal(prev => ({ ...prev, [key]: val }))
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
      {/* Channel header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
          {meta.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{meta.label}</h2>
            {local.enabled
              ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(34,197,94,0.12)', color: 'var(--success)', fontWeight: 600 }}>Active</span>
              : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--surface3)', color: 'var(--text-dim)', fontWeight: 600 }}>Disabled</span>
            }
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{meta.description}</p>
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 28 }}>
        {meta.fields.map(field => (
          <div key={field.key}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
              {field.label}
            </label>
            <FieldEditor
              def={field}
              value={local[field.key]}
              onChange={val => set(field.key, val)}
            />
            {field.help && (
              <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '5px 0 0', lineHeight: 1.5 }}>{field.help}</p>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 20, borderTop: '1px solid var(--border)', alignItems: 'center' }}>
        <button
          onClick={() => onSave(channelKey, local)}
          disabled={!isDirty || saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
            borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: !isDirty || saving ? 'not-allowed' : 'pointer',
            background: isDirty ? 'var(--accent)' : 'var(--surface3)',
            color: isDirty ? '#fff' : 'var(--text-dim)',
            opacity: saving ? 0.7 : 1,
          }}
        >
          <Save size={13} /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <div style={{ flex: 1 }} />
        {confirmDelete ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--error)' }}>Remove {meta.label}?</span>
            <button onClick={() => onDelete(channelKey)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--error)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
              Yes, remove
            </button>
            <button onClick={() => setConfirmDelete(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: 'var(--error)', fontSize: 13, cursor: 'pointer' }}>
            <Trash2 size={12} /> Remove channel
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Add channel modal ────────────────────────────────────────────────────────

function AddChannelModal({ existing, onAdd, onClose }: {
  existing: string[]
  onAdd: (key: string) => void
  onClose: () => void
}) {
  const available = Object.entries(CHANNEL_META).filter(([k]) => !existing.includes(k))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 480, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Add a Channel</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {available.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>All supported channels are already configured.</p>
          )}
          {available.map(([key, meta]) => (
            <button key={key} onClick={() => { onAdd(key); onClose() }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {meta.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{meta.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{meta.description}</div>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--text-dim)', marginLeft: 'auto', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function ChannelsView({ instance }: { instance: OpenClawInstance }) {
  const [channels, setChannels] = useState<Record<string, Record<string, unknown>>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const wp = instance.workspacePath

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const out = await sshExec(instance.id, `cat "${wp}/openclaw.json" 2>/dev/null || echo "{}"`)
      const cfg = JSON.parse(out.trim() || '{}')
      const ch = cfg.channels ?? {}
      setChannels(ch)
      // Auto-select first configured channel
      const keys = Object.keys(ch)
      if (keys.length > 0 && !selected) setSelected(keys[0])
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [instance.id, wp])

  useEffect(() => { load().catch(() => {}) }, [load])

  async function saveChannel(key: string, data: Record<string, unknown>) {
    setSaving(true); setSaveMsg('')
    try {
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify({ key, data }))))
      await sshExec(instance.id, `python3 -c "
import json, base64
payload = json.loads(base64.b64decode('${b64}').decode())
with open('${wp}/openclaw.json', 'r') as f:
    cfg = json.load(f)
if 'channels' not in cfg:
    cfg['channels'] = {}
cfg['channels'][payload['key']] = payload['data']
with open('${wp}/openclaw.json', 'w') as f:
    json.dump(cfg, f, indent=2)
print('ok')
"`)
      setChannels(prev => ({ ...prev, [key]: data }))
      setSaveMsg('Saved! Restart the gateway for changes to take effect.')
      setTimeout(() => setSaveMsg(''), 4000)
    } catch (e) {
      setError(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setSaving(false) }
  }

  async function deleteChannel(key: string) {
    try {
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify({ key }))))
      await sshExec(instance.id, `python3 -c "
import json, base64
payload = json.loads(base64.b64decode('${b64}').decode())
with open('${wp}/openclaw.json', 'r') as f:
    cfg = json.load(f)
cfg.get('channels', {}).pop(payload['key'], None)
with open('${wp}/openclaw.json', 'w') as f:
    json.dump(cfg, f, indent=2)
print('ok')
"`)
      const next = { ...channels }
      delete next[key]
      setChannels(next)
      setSelected(Object.keys(next)[0] ?? null)
    } catch (e) { setError(`Delete failed: ${e instanceof Error ? e.message : String(e)}`) }
  }

  function addChannel(key: string) {
    const defaults: Record<string, unknown> = { enabled: false }
    // Pre-fill sensible defaults per channel
    if (key === 'slack') { defaults.mode = 'socket'; defaults.dmPolicy = 'allowlist'; defaults.groupPolicy = 'allowlist'; defaults.requireMention = false; defaults.allowFrom = [] }
    if (key === 'telegram') { defaults.requireMention = false; defaults.allowFrom = [] }
    if (key === 'discord') { defaults.requireMention = true; defaults.guildIds = [] }
    setChannels(prev => ({ ...prev, [key]: defaults }))
    setSelected(key)
  }

  const configuredKeys = Object.keys(channels)
  const selectedMeta = selected ? (CHANNEL_META[selected] ?? null) : null
  const selectedConfig = selected ? (channels[selected] ?? {}) : {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={15} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Channels</h1>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{instance.name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>· {configuredKeys.length} configured</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {saveMsg && (
            <span style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle size={12} /> {saveMsg}
            </span>
          )}
          <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={12} /> Add Channel
          </button>
          <button onClick={() => load().catch(() => {})} disabled={loading} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '8px 20px', fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', flexShrink: 0 }}>{error}</div>}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* Channel list sidebar */}
        <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 12px 6px', fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Configured
          </div>

          {loading && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}

          {!loading && configuredKeys.length === 0 && (
            <div style={{ padding: '20px 14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              No channels yet.<br />Click <strong>Add Channel</strong> to start.
            </div>
          )}

          {configuredKeys.map(key => {
            const meta = CHANNEL_META[key]
            const cfg = channels[key]
            const isActive = selected === key
            const isEnabled = cfg?.enabled !== false
            return (
              <button key={key} onClick={() => setSelected(key)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                border: 'none', background: isActive ? 'var(--accent-dim)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text)', cursor: 'pointer',
                textAlign: 'left', width: '100%',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{meta?.icon ?? '🔌'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {meta?.label ?? key}
                  </div>
                  <div style={{ fontSize: 10, marginTop: 1, color: isEnabled ? 'var(--success)' : 'var(--text-dim)' }}>
                    {isEnabled ? '● active' : '○ disabled'}
                  </div>
                </div>
                {isActive && <Settings size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
              </button>
            )
          })}

          {/* Available to add */}
          {Object.keys(CHANNEL_META).filter(k => !configuredKeys.includes(k)).length > 0 && (
            <>
              <div style={{ padding: '12px 12px 6px', marginTop: 8, fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', borderTop: '1px solid var(--border)' }}>
                Available
              </div>
              {Object.entries(CHANNEL_META).filter(([k]) => !configuredKeys.includes(k)).map(([key, meta]) => (
                <button key={key} onClick={() => { addChannel(key) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: 'none', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', textAlign: 'left', width: '100%', opacity: 0.6 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label}</div>
                  </div>
                  <Plus size={11} style={{ flexShrink: 0 }} />
                </button>
              ))}
            </>
          )}
        </div>

        {/* Config panel */}
        {selected && selectedMeta ? (
          <ChannelConfig
            key={selected}
            channelKey={selected}
            config={selectedConfig}
            meta={selectedMeta}
            onSave={saveChannel}
            onDelete={deleteChannel}
            saving={saving}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--text-muted)' }}>
            <Radio size={40} style={{ opacity: 0.15 }} />
            <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Select a channel to configure</p>
            <p style={{ fontSize: 13, margin: 0, color: 'var(--text-dim)' }}>Or click <strong>Add Channel</strong> to connect a new one</p>
            <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>
              <Plus size={13} /> Add your first channel
            </button>
          </div>
        )}
      </div>

      {showAdd && (
        <AddChannelModal
          existing={configuredKeys}
          onAdd={addChannel}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
