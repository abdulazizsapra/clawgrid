import { getRegistry } from '@/lib/instances'
import type { OpenClawInstance } from '@/types'
import { Sidebar } from '@/components/layout/Sidebar'
import { ModelRoutingPanel } from '@/components/routing/ModelRoutingPanel'

function sanitize(inst: OpenClawInstance) {
  const { token: _t, sshKeyPath: _k, ...safe } = inst
  return safe
}

export default function RoutingPage() {
  const registry = getRegistry()
  const instances = registry.instances.map(sanitize) as OpenClawInstance[]
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar instances={instances} />
      <main className="mobile-main" style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <ModelRoutingPanel instances={instances} />
      </main>
    </div>
  )
}
