'use client'
import Link from 'next/link'
import { MessageSquare, Clock, Brain, DollarSign, Terminal, Settings, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OpenClawInstance, GatewayHealth } from '@/types'

type InstanceWithHealth = OpenClawInstance & { health?: GatewayHealth }

const QUICK_LINKS = [
  { href: 'chat', icon: MessageSquare, label: 'Chat' },
  { href: 'crons', icon: Clock, label: 'Crons' },
  { href: 'memory', icon: Brain, label: 'Memory' },
  { href: 'cost', icon: DollarSign, label: 'Cost' },
  { href: 'logs', icon: Terminal, label: 'Logs' },
]

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  online:  { bg: 'rgba(34,197,94,0.1)',  text: '#4ade80', border: 'rgba(34,197,94,0.3)' },
  offline: { bg: 'rgba(239,68,68,0.1)',  text: '#f87171', border: 'rgba(239,68,68,0.3)' },
  degraded:{ bg: 'rgba(245,158,11,0.1)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
  unknown: { bg: 'rgba(115,115,115,0.1)',text: '#a3a3a3', border: 'rgba(115,115,115,0.3)' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.unknown
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {status}
    </span>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--surface2)' }}>
      <div className="font-medium text-sm">{value}</div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

export function FleetGrid({ instances }: { instances: InstanceWithHealth[] }) {
  if (instances.length === 0) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
        <p className="text-lg font-medium mb-2">No instances configured</p>
        <Link href="/instances/new" className="text-sm" style={{ color: 'var(--accent)' }}>
          Add your first instance →
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {instances.map(inst => (
        <div
          key={inst.id}
          className="rounded-xl p-5 flex flex-col gap-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{inst.name}</span>
                <StatusBadge status={inst.status} />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {inst.sshHost} · {inst.role}
              </p>
            </div>
            <Link
              href={`/instances/${inst.id}/settings`}
              className="transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Settings"
            >
              <Settings size={14} />
            </Link>
          </div>

          {inst.health && inst.status !== 'offline' && (
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="version" value={inst.health.version ?? '—'} />
              <StatBox label="memory" value={inst.health.memoryMb ? `${inst.health.memoryMb}MB` : '—'} />
              <StatBox label="chats" value={String(inst.health.activeChats ?? '—')} />
            </div>
          )}

          {inst.health?.error && (
            <p
              className="text-xs rounded-lg px-3 py-2"
              style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.08)' }}
            >
              {inst.health.error}
            </p>
          )}

          <div className="flex gap-2 flex-wrap mt-auto">
            {QUICK_LINKS.map(link => (
              <Link
                key={link.href}
                href={`/instances/${inst.id}/${link.href}`}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors'
                )}
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <link.icon size={11} />
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
