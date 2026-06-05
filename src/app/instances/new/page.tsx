import { AddInstanceForm } from '@/components/settings/AddInstanceForm'
import { getRegistry } from '@/lib/instances'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function NewInstancePage() {
  const registry = getRegistry()
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar instances={registry.instances} />
      <main style={{ flex: 1, overflow: 'auto', padding: '32px 40px', minWidth: 0 }}>
        <div style={{ maxWidth: 600 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>Add Instance</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 28px' }}>
            Connect a new OpenClaw deployment to ClawGrid. Works with any server — direct SSH or via a jump host.
          </p>
          <AddInstanceForm />
        </div>
      </main>
    </div>
  )
}
