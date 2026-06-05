'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

function Field({
  label, value, onChange, placeholder, type = 'text', hint, required,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; hint?: string; required?: boolean
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--accent)', marginLeft: 2 }}>*</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

export function AddInstanceForm() {
  const router = useRouter()
  const [form, setForm] = useState<Omit<OpenClawInstance, 'status'>>({
    id: '', name: '', role: 'command',
    gatewayUrl: 'http://localhost:4000', token: '',
    sshHost: '', sshPort: 22, sshJumpHost: '',
    sshUser: 'openclaw',
    sshKeyPath: '~/.ssh/clawgrid',
    workspacePath: '/home/openclaw/.openclaw',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key: keyof typeof form) {
    return (v: string) => setForm(f => ({ ...f, [key]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.id || !form.name || !form.gatewayUrl) {
      setError('ID, Name, and Gateway URL are required.')
      return
    }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, status: 'unknown' }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? `Save failed (${res.status})`); return }
      router.push(`/instances/${form.id}/chat`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error — is the server running?')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <div style={{ fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
          {error}
        </div>
      )}

      <Section title="Identity">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="ID (slug)" value={form.id} onChange={set('id')} placeholder="my-instance" required hint="Used in URLs, must be unique" />
          <Field label="Display Name" value={form.name} onChange={set('name')} placeholder="Production" required />
        </div>
        <Field label="Role" value={form.role} onChange={set('role')} placeholder="command / supply / voice" />
      </Section>

      <Section title="Gateway">
        <Field label="URL" value={form.gatewayUrl} onChange={set('gatewayUrl')} placeholder="http://localhost:4000" required hint="OpenClaw gateway endpoint" />
        <Field label="Bearer Token" value={form.token} onChange={set('token')} type="password" placeholder="From openclaw.json gateway.auth.token" />
      </Section>

      <Section title="SSH Access">
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 14 }}>
          <Field label="Host" value={form.sshHost} onChange={set('sshHost')} placeholder="203.0.113.10 or 10.0.0.5" required />
          <Field label="Port" value={String(form.sshPort ?? 22)} onChange={v => setForm(f => ({ ...f, sshPort: parseInt(v) || 22 }))} placeholder="22" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="SSH User" value={form.sshUser} onChange={set('sshUser')} placeholder="openclaw" />
          <Field label="Private Key Path" value={form.sshKeyPath} onChange={set('sshKeyPath')} placeholder="~/.ssh/clawgrid" hint="Must be passphrase-free" />
        </div>
        <Field label="Jump Host (optional)" value={form.sshJumpHost ?? ''} onChange={set('sshJumpHost')} placeholder="user@bastion.example.com" hint="Leave blank for direct SSH. Use for private servers behind a bastion." />
        <Field label="Workspace Path" value={form.workspacePath} onChange={set('workspacePath')} placeholder="/home/openclaw/.openclaw" hint="Path to the .openclaw directory on the server" />
      </Section>

      <button
        type="submit" disabled={saving}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          background: 'var(--accent)', color: 'white', border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        <Plus size={13} />
        {saving ? 'Adding…' : 'Add Instance'}
      </button>
    </form>
  )
}
