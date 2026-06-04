'use client'
import { useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { OpenClawInstance } from '@/types'

function Field({ label, name, value, onChange, type = 'text', placeholder }: {
  label: string; name: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input
        type={type} name={name} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
      />
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
    await fetch('/api/instances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    router.refresh()
  }

  async function remove() {
    if (!confirm(`Delete instance "${instance.name}"? This cannot be undone.`)) return
    setDeleting(true)
    await fetch('/api/instances', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: instance.id }) })
    router.push('/fleet')
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-semibold mb-1">Instance Settings</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{instance.name}</p>

      <div className="space-y-4 mb-8">
        <div className="grid grid-cols-2 gap-4">
          <Field label="ID (slug)" name="id" value={form.id} onChange={set('id')} placeholder="vm-openclaw" />
          <Field label="Display Name" name="name" value={form.name} onChange={set('name')} placeholder="Command" />
        </div>
        <Field label="Role" name="role" value={form.role} onChange={set('role')} placeholder="command / supply / voice" />
        <Field label="Gateway URL" name="gatewayUrl" value={form.gatewayUrl} onChange={set('gatewayUrl')} placeholder="http://localhost:4000" />
        <Field label="Gateway Token" name="token" value={form.token} onChange={set('token')} type="password" placeholder="Bearer token for gateway auth" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="SSH Host" name="sshHost" value={form.sshHost} onChange={set('sshHost')} placeholder="10.0.0.10" />
          <Field label="SSH User" name="sshUser" value={form.sshUser} onChange={set('sshUser')} placeholder="openclaw" />
        </div>
        <Field label="SSH Key Path" name="sshKeyPath" value={form.sshKeyPath} onChange={set('sshKeyPath')} placeholder="/root/.ssh/id_ed25519" />
        <Field label="Workspace Path (SSHFS mount)" name="workspacePath" value={form.workspacePath} onChange={set('workspacePath')} placeholder="/mnt/openclaw-command" />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <Save size={13} />
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
        </button>
        <button
          onClick={remove} disabled={deleting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
          style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <Trash2 size={13} />
          {deleting ? 'Deleting…' : 'Delete Instance'}
        </button>
      </div>
    </div>
  )
}
