import { AddInstanceForm } from '@/components/settings/AddInstanceForm'
import { getRegistry } from '@/lib/instances'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function NewInstancePage() {
  const registry = getRegistry()
  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
      <Sidebar instances={registry.instances} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-xl">
          <h1 className="text-xl font-semibold mb-1">Add Instance</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Connect a new OpenClaw deployment to this control panel.
          </p>
          <AddInstanceForm />
        </div>
      </main>
    </div>
  )
}
