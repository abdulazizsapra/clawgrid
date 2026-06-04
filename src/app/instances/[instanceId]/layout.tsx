import { getRegistry } from '@/lib/instances'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function InstanceLayout({ children }: { children: React.ReactNode }) {
  const registry = getRegistry()
  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
      <Sidebar instances={registry.instances} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
