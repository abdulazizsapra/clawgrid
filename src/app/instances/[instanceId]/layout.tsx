import { getRegistry } from '@/lib/instances'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function InstanceLayout({ children }: { children: React.ReactNode }) {
  const registry = getRegistry()
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar instances={registry.instances} />
      <main style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>{children}</main>
    </div>
  )
}
