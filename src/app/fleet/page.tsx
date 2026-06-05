import { getRegistry } from '@/lib/instances'
import { fetchGatewayHealth } from '@/lib/gateway'
import { fetchInstanceKPIs } from '@/lib/fleet'
import { FleetGrid } from '@/components/fleet/FleetGrid'
import { Sidebar } from '@/components/layout/Sidebar'
import type { InstanceKPIs } from '@/lib/fleet'

export const dynamic = 'force-dynamic'

export default async function FleetPage() {
  const registry = getRegistry()

  // Fetch gateway health + SSH KPIs for all instances in parallel
  const [healthResults, kpiResults] = await Promise.all([
    Promise.allSettled(
      registry.instances.map(inst => fetchGatewayHealth(inst.gatewayUrl, inst.token))
    ),
    Promise.allSettled(
      registry.instances.map(inst => fetchInstanceKPIs(inst))
    ),
  ])

  const instancesWithData = registry.instances.map((inst, i) => {
    const h = healthResults[i]
    const k = kpiResults[i]
    const health = h.status === 'fulfilled' ? h.value : { instanceId: inst.id, status: 'offline' as const, error: 'unreachable' }
    const kpis: InstanceKPIs | null = k.status === 'fulfilled' ? k.value : null
    return { ...inst, status: health.status, health, kpis }
  })

  const online = instancesWithData.filter(i => i.status === 'online').length
  const totalCrons = instancesWithData.reduce((s, i) => s + (i.kpis?.cronTotal ?? 0), 0)
  const totalMessages = instancesWithData.reduce((s, i) => s + (i.kpis?.convMessages ?? 0), 0)
  const updatesAvailable = instancesWithData.filter(i => i.kpis?.updateAvailable).length

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar instances={instancesWithData} />
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {/* Page header */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="ClawGrid" style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>ClawGrid</h1>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, marginBottom: 0 }}>
                  {registry.instances.length} instance{registry.instances.length !== 1 ? 's' : ''}
                  {' · '}
                  <span style={{ color: online > 0 ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>{online} online</span>
                </p>
              </div>
            </div>
            <a href="/docs" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
              Docs
            </a>
          </div>

          {/* Fleet-level summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 28 }}>
            {[
              { label: 'Instances Online', value: `${online} / ${registry.instances.length}`, color: online === registry.instances.length ? 'var(--success)' : online > 0 ? 'var(--warning)' : 'var(--error)' },
              { label: 'Cron Jobs', value: String(totalCrons), color: 'var(--accent)' },
              { label: 'Messages', value: String(totalMessages), color: 'var(--text)' },
              { label: 'Updates Available', value: String(updatesAvailable), color: updatesAvailable > 0 ? 'var(--warning)' : 'var(--success)' },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color, lineHeight: 1, marginBottom: 5 }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>{kpi.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Instance cards */}
        <div style={{ padding: '0 28px 28px' }}>
          <FleetGrid instances={instancesWithData} />
        </div>
      </main>
    </div>
  )
}
