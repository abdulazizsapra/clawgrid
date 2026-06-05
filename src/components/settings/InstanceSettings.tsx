'use client'
import { useState } from 'react'
import { Save, Trash2, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { OpenClawInstance } from '@/types'

function Field({
  label, value, onChange, type = 'text', placeholder, hint,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; hint?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>
        {label}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

export function InstanceSettings({ instance }: { instance: OpenClawInstance }) {
  const router = useRouter()
  const [form, setForm] = useState({ ...instance })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function set(key: keyof OpenClawInstance) {
    return (v: string) => setForm(f => ({ ...f, [key]: v }))
  }

  async function save() {
    setSaving(true); setSaved(false)
    try {
      const res = await fetch('/api/instances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete "${instance.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await fetch('/api/instances', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: instance.id }) })
      router.push('/fleet')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
      setDeleting(false)
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 560 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Instance Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{instance.name} · {instance.id}</p>
      </div>

      <Section title="Identity">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="ID (slug)" value={form.id} onChange={set('id')} placeholder="vm-openclaw" />
          <Field label="Display Name" value={form.name} onChange={set('name')} placeholder="Command" />
        </div>
        <Field label="Role" value={form.role} onChange={set('role')} placeholder="command / supply / voice" />
      </Section>

      <Section title="Gateway">
        <Field label="URL" value={form.gatewayUrl} onChange={set('gatewayUrl')} placeholder="http://localhost:18789" hint="OpenClaw gateway URL — use localhost if tunneled, or the server's address for direct access" />
        <Field label="Bearer Token" value={form.token} onChange={set('token')} type="password" placeholder="From openclaw.json → gateway.auth.token" />
      </Section>

      <Section title="SSH Access">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Host" value={form.sshHost} onChange={set('sshHost')} placeholder="192.168.1.5 or server.example.com" />
          <Field label="User" value={form.sshUser} onChange={set('sshUser')} placeholder="openclaw" />
        </div>
        <Field label="Private Key Path" value={form.sshKeyPath} onChange={set('sshKeyPath')} placeholder="~/.ssh/clawgrid" hint="Path to a passphrase-free private key on the machine running this panel" />
        <Field label="Workspace Path" value={form.workspacePath} onChange={set('workspacePath')} placeholder="/home/openclaw/.openclaw" hint="Absolute path to the .openclaw directory on the remote server" />
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={save} disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8,
            fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer',
            background: saved ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
            color: saved ? 'var(--success)' : 'white',
            border: saved ? '1px solid rgba(34,197,94,0.3)' : '1px solid transparent',
          }}
        >
          {saved ? <CheckCircle size={13} /> : <Save size={13} />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
        </button>
        <button
          onClick={remove} disabled={deleting}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8,
            fontSize: 13, cursor: deleting ? 'not-allowed' : 'pointer',
            background: 'var(--error-dim)', color: 'var(--error)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          <Trash2 size={13} />
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
