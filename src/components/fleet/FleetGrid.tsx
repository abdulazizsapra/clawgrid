'use client'
import Link from 'next/link'
import { MessageSquare, Clock, Brain, Terminal, Settings, Activity, ArrowUpCircle, AlertTriangle, CheckCircle, Users, History } from 'lucide-react'
import type { OpenClawInstance, GatewayHealth } from '@/types'
import type { InstanceKPIs } from '@/lib/fleet'

type InstanceWithHealth = OpenClawInstance & { health?: GatewayHealth; kpis?: InstanceKPIs | null }

const STATUS: Record<string, { dot: string; badge: string; text: string; label: string }> = {
  online:   { dot: '#22c55e', badge: 'rgba(34,197,94,0.12)',   text: '#4ade80', label: 'online' },
  offline:  { dot: '#ef4444', badge: 'rgba(239,68,68,0.12)',   text: '#f87171', label: 'offline' },
  degraded: { dot: '#f59e0b', badge: 'rgba(245,158,11,0.12)',  text: '#fbbf24', label: 'degraded' },
  unknown:  { dot: '#555',    badge: 'rgba(115,115,115,0.12)', text: '#888',    label: 'unknown' },
}

const ROLE_COLORS: Record<string, string> = {
  command: '#3b82f6',
  supply:  '#a855f7',
  voice:   '#22c55e',
}

const QUICK_LINKS = [
  { href: 'chat',     icon: MessageSquare, label: 'Chat' },
  { href: 'crons',    icon: Clock,         label: 'Crons' },
  { href: 'memory',   icon: Brain,         label: 'Memory' },
  { href: 'sessions', icon: History,       label: 'Sessions' },
  { href: 'health',   icon: Activity,      label: 'Health' },
  { href: 'logs',     icon: Terminal,      label: 'Logs' },
]

function KpiCell({ label, value, sub, color, alert }: { label: string; value: string | number; sub?: string; color?: string; alert?: boolean }) {
  return (
    <div style={{
      background: alert ? 'rgba(239,68,68,0.06)' : 'var(--surface2)',
      border: `1px solid ${alert ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
      borderRadius: 9, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1, marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function FleetGrid({ instances }: { instances: InstanceWithHealth[] }) {
  if (instances.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
        <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No instances configured</p>
        <Link href="/instances/new" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
          Add your first instance →
        </Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instances.map(inst => {
        const s = STATUS[inst.status] ?? STATUS.unknown
        const roleColor = ROLE_COLORS[inst.role]
        const kpis = inst.kpis
        const offline = inst.status === 'offline'

        return (
          <div
            key={inst.id}
            style={{
              background: 'var(--surface)',
              border: `1px solid ${offline ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: roleColor ? `${roleColor}22` : 'var(--surface2)',
                  border: `2px solid ${roleColor ? `${roleColor}44` : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 800, color: roleColor ?? 'var(--text-muted)',
                }}>
                  {inst.name.slice(0, 2).toUpperCase()}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{inst.name}</span>
                    {/* Status badge */}
                    <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, background: s.badge, color: s.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
                      {s.label}
                    </span>
                    {/* Role badge */}
                    {roleColor && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: `${roleColor}22`, color: roleColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {inst.role}
                      </span>
                    )}
                    {/* Update badge */}
                    {kpis?.updateAvailable && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <ArrowUpCircle size={9} /> Update available
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 12 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{inst.sshHost}</span>
                    {kpis?.installedVersion && (
                      <span>v{kpis.installedVersion}{kpis.latestVersion && kpis.updateAvailable ? ` → ${kpis.latestVersion}` : ''}</span>
                    )}
                    {inst.gatewayUrl && <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{inst.gatewayUrl}</span>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {kpis?.cronErrors && kpis.cronErrors > 0 ? (
                  <span title={`${kpis.cronErrors} cron job error${kpis.cronErrors > 1 ? 's' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--error)', background: 'rgba(239,68,68,0.1)', padding: '3px 8px', borderRadius: 20 }}>
                    <AlertTriangle size={10} /> {kpis.cronErrors} error{kpis.cronErrors > 1 ? 's' : ''}
                  </span>
                ) : kpis && !offline ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--success)' }}>
                    <CheckCircle size={11} /> healthy
                  </span>
                ) : null}
                <Link href={`/instances/${inst.id}/settings`} style={{ color: 'var(--text-dim)', padding: 4, display: 'flex' }}>
                  <Settings size={14} />
                </Link>
              </div>
            </div>

            {/* KPI grid */}
            {kpis && !offline && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  <KpiCell
                    label="Cron Jobs"
                    value={`${kpis.cronEnabled} / ${kpis.cronTotal}`}
                    sub={`${kpis.cronRan} ran · ${kpis.cronErrors} errors`}
                    color="var(--accent)"
                    alert={kpis.cronErrors > 0}
                  />
                  <KpiCell
                    label="Conversations"
                    value={kpis.convMessages}
                    sub={`across ${kpis.convAgents} agent${kpis.convAgents !== 1 ? 's' : ''}`}
                    color="var(--text)"
                  />
                  <KpiCell
                    label="Memory Files"
                    value={kpis.memFiles}
                    sub={`${kpis.memChunks} chunks`}
                    color="var(--text)"
                  />
                  <KpiCell
                    label="Agents"
                    value={kpis.agentCount}
                    sub="sub-agents"
                    color="var(--text)"
                  />
                  {inst.health?.memoryMb != null && (
                    <KpiCell
                      label="Gateway RAM"
                      value={`${inst.health.memoryMb}MB`}
                      color="var(--text)"
                    />
                  )}
                  <KpiCell
                    label="Gateway Log"
                    value={`${kpis.logSizeKb}KB`}
                    color="var(--text)"
                  />
                </div>
              </div>
            )}

            {/* Offline state */}
            {offline && inst.health?.error && (
              <div style={{ padding: '12px 20px', background: 'rgba(239,68,68,0.04)', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--error)' }}>
                {inst.health.error}
              </div>
            )}

            {/* Quick links */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 20px' }}>
              {QUICK_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={`/instances/${inst.id}/${link.href}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12, padding: '6px 11px', borderRadius: 7,
                    border: '1px solid var(--border)', color: 'var(--text-muted)',
                    textDecoration: 'none', background: 'var(--surface2)',
                  }}
                >
                  <link.icon size={11} />
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
