import { getRegistry } from '@/lib/instances'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function InstanceLayout({ children }: { children: React.ReactNode }) {
  const registry = getRegistry()
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar instances={registry.instances} />
      <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>{children}</main>
    </div>
  )
}
