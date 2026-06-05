import { getRegistry } from '@/lib/instances'
import { Sidebar } from '@/components/layout/Sidebar'
import { PanelSettings } from '@/components/settings/PanelSettings'

export default function PanelSettingsPage() {
  const registry = getRegistry()
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar instances={registry.instances} />
      <main style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <PanelSettings />
      </main>
    </div>
  )
}
