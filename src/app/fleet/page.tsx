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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar instances={instancesWithHealth} />
      <main style={{ flex: 1, padding: 28, overflowY: 'auto', minWidth: 0 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Fleet Overview</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            <span style={{ color: online > 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>{online}</span>
            {' / '}{instancesWithHealth.length} instances online
          </p>
        </div>
        <FleetGrid instances={instancesWithHealth} />
      </main>
    </div>
  )
}
