'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

function Field({ label, name, value, onChange, placeholder, type = 'text' }: {
  label: string; name: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
      />
    </div>
  )
}

export function AddInstanceForm() {
  const router = useRouter()
  const [form, setForm] = useState<Omit<OpenClawInstance, 'status'>>({
    id: '', name: '', role: '', gatewayUrl: '', token: '',
    sshHost: '', sshUser: 'openclaw', sshKeyPath: '/root/.ssh/id_ed25519', workspacePath: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key: keyof typeof form) { return (v: string) => setForm(f => ({ ...f, [key]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.id || !form.name || !form.gatewayUrl) { setError('ID, Name, and Gateway URL are required.'); return }
    setSaving(true); setError('')
    await fetch('/api/instances', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, status: 'unknown' }),
    })
    router.push(`/instances/${form.id}/chat`)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="ID (slug) *" name="id" value={form.id} onChange={set('id')} placeholder="my-instance" />
        <Field label="Display Name *" name="name" value={form.name} onChange={set('name')} placeholder="Production" />
      </div>
      <Field label="Role" name="role" value={form.role} onChange={set('role')} placeholder="command / supply / voice" />
      <Field label="Gateway URL *" name="gatewayUrl" value={form.gatewayUrl} onChange={set('gatewayUrl')} placeholder="http://localhost:4000" />
      <Field label="Gateway Token" name="token" value={form.token} onChange={set('token')} type="password" placeholder="Bearer token" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="SSH Host" name="sshHost" value={form.sshHost} onChange={set('sshHost')} placeholder="10.0.0.10" />
        <Field label="SSH User" name="sshUser" value={form.sshUser} onChange={set('sshUser')} placeholder="openclaw" />
      </div>
      <Field label="SSH Key Path" name="sshKeyPath" value={form.sshKeyPath} onChange={set('sshKeyPath')} placeholder="/root/.ssh/id_ed25519" />
      <Field label="Workspace Path" name="workspacePath" value={form.workspacePath} onChange={set('workspacePath')} placeholder="/mnt/openclaw-command" />
      <button
        type="submit" disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
        style={{ background: 'var(--accent)', color: 'white' }}
      >
        <Plus size={13} />
        {saving ? 'Adding…' : 'Add Instance'}
      </button>
    </form>
  )
}
