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
    id: '', name: '', role: '',
    gatewayUrl: 'http://localhost:4000', token: '',
    sshHost: '', sshUser: 'openclaw',
    sshKeyPath: '/root/.ssh/id_ed25519',
    workspacePath: '',
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
    await fetch('/api/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, status: 'unknown' }),
    })
    router.push(`/instances/${form.id}/chat`)
    router.refresh()
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Host" value={form.sshHost} onChange={set('sshHost')} placeholder="10.0.0.10" />
          <Field label="User" value={form.sshUser} onChange={set('sshUser')} placeholder="openclaw" />
        </div>
        <Field label="Private Key Path" value={form.sshKeyPath} onChange={set('sshKeyPath')} placeholder="/root/.ssh/id_ed25519" />
        <Field label="Workspace Path" value={form.workspacePath} onChange={set('workspacePath')} placeholder="/mnt/openclaw-command" hint="SSHFS mount of ~/.openclaw on the worker VM" />
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
