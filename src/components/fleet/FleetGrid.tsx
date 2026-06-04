'use client'
import Link from 'next/link'
import { MessageSquare, Clock, Brain, DollarSign, Terminal, Settings } from 'lucide-react'
import type { OpenClawInstance, GatewayHealth } from '@/types'

type InstanceWithHealth = OpenClawInstance & { health?: GatewayHealth }

const QUICK_LINKS = [
  { href: 'chat',   icon: MessageSquare, label: 'Chat' },
  { href: 'crons',  icon: Clock,         label: 'Crons' },
  { href: 'memory', icon: Brain,         label: 'Memory' },
  { href: 'cost',   icon: DollarSign,    label: 'Cost' },
  { href: 'logs',   icon: Terminal,      label: 'Logs' },
]

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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
      {instances.map(inst => {
        const s = STATUS[inst.status] ?? STATUS.unknown
        const roleColor = ROLE_COLORS[inst.role]

        return (
          <div
            key={inst.id}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: roleColor ? `${roleColor}22` : 'var(--surface2)',
                  border: `1px solid ${roleColor ? `${roleColor}44` : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: roleColor ?? 'var(--text-muted)',
                  flexShrink: 0,
                }}>
                  {inst.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{inst.name}</span>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 20,
                      background: s.badge, color: s.text, fontWeight: 500,
                    }}>
                      {s.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {inst.sshHost}
                    {roleColor && (
                      <span style={{ marginLeft: 6, color: roleColor, fontWeight: 500 }}>· {inst.role}</span>
                    )}
                  </p>
                </div>
              </div>
              <Link href={`/instances/${inst.id}/settings`} style={{ color: 'var(--text-dim)', padding: 4 }}>
                <Settings size={14} />
              </Link>
            </div>

            {/* Stats */}
            {inst.health && inst.status !== 'offline' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: 'version', value: inst.health.version ?? '—' },
                  { label: 'memory',  value: inst.health.memoryMb ? `${inst.health.memoryMb}MB` : '—' },
                  { label: 'chats',   value: String(inst.health.activeChats ?? '—') },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{stat.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {inst.health?.error && (
              <div style={{ fontSize: 12, color: 'var(--error)', background: 'var(--error-dim)', borderRadius: 8, padding: '8px 12px' }}>
                {inst.health.error}
              </div>
            )}

            {/* Quick links */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
              {QUICK_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={`/instances/${inst.id}/${link.href}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12, padding: '6px 10px', borderRadius: 7,
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    background: 'var(--surface2)',
                    transition: 'all 0.15s',
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
