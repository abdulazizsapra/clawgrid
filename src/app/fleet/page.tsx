import { getRegistry } from '@/lib/instances'
import { fetchGatewayHealth } from '@/lib/gateway'
import { FleetGrid } from '@/components/fleet/FleetGrid'
import { Sidebar } from '@/components/layout/Sidebar'

export const dynamic = 'force-dynamic'

export default async function FleetPage() {
  const registry = getRegistry()

  const healths = await Promise.allSettled(
    registry.instances.map(inst => fetchGatewayHealth(inst.gatewayUrl, inst.token))
  )

  const instancesWithHealth = registry.instances.map((inst, i) => {
    const h = healths[i]
    const health = h.status === 'fulfilled' ? h.value : { instanceId: inst.id, status: 'offline' as const, error: 'fetch failed' }
    return { ...inst, status: health.status, health }
  })

  const online = instancesWithHealth.filter(i => i.status === 'online').length

  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
      <Sidebar instances={instancesWithHealth} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Fleet Overview</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {online} / {instancesWithHealth.length} instances online
          </p>
        </div>
        <FleetGrid instances={instancesWithHealth} />
      </main>
    </div>
  )
}
