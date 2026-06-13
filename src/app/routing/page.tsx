import { getRegistry } from '@/lib/instances'
import { Sidebar } from '@/components/layout/Sidebar'
import { ModelRoutingPanel } from '@/components/routing/ModelRoutingPanel'

export default function RoutingPage() {
  const registry = getRegistry()
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar instances={registry.instances} />
      <main className="mobile-main" style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <ModelRoutingPanel instances={registry.instances} />
      </main>
    </div>
  )
}
