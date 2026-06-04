'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, MessageSquare, Clock, Brain,
  DollarSign, Radio, Settings, Plus, Terminal, Zap
} from 'lucide-react'
import type { OpenClawInstance } from '@/types'

const INSTANCE_NAV = [
  { href: 'chat', icon: MessageSquare, label: 'Chat' },
  { href: 'agents', icon: Zap, label: 'Agents' },
  { href: 'crons', icon: Clock, label: 'Crons' },
  { href: 'memory', icon: Brain, label: 'Memory' },
  { href: 'cost', icon: DollarSign, label: 'Cost' },
  { href: 'channels', icon: Radio, label: 'Channels' },
  { href: 'logs', icon: Terminal, label: 'Logs' },
  { href: 'settings', icon: Settings, label: 'Settings' },
]

const ROLE_COLORS: Record<string, string> = {
  command: '#3b82f6',
  supply: '#a855f7',
  voice: '#22c55e',
}

export function Sidebar({ instances }: { instances: OpenClawInstance[] }) {
  const pathname = usePathname()
  const activeInstance = instances.find(i => pathname.includes(`/instances/${i.id}`))

  return (
    <aside
      className="w-56 shrink-0 flex flex-col"
      style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', height: '100vh', overflowY: 'auto' }}
    >
      <div className="p-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs"
          style={{ background: 'var(--accent)' }}
        >
          OC
        </div>
        <span className="font-semibold text-sm">Control Panel</span>
      </div>

      <div className="p-3">
        <Link
          href="/fleet"
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
            pathname === '/fleet'
              ? 'text-white'
              : 'hover:text-white'
          )}
          style={{
            background: pathname === '/fleet' ? 'var(--accent)' : 'transparent',
            color: pathname === '/fleet' ? 'white' : 'var(--text-muted)',
          }}
        >
          <LayoutDashboard size={15} />
          <span>Fleet Overview</span>
        </Link>
      </div>

      <div className="px-3 pb-3 flex-1">
        <p className="text-xs font-medium px-3 mb-2" style={{ color: 'var(--text-muted)' }}>
          INSTANCES
        </p>

        {instances.map(inst => {
          const isActive = activeInstance?.id === inst.id
          return (
            <div key={inst.id} className="mb-1">
              <Link
                href={`/instances/${inst.id}/chat`}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors w-full"
                style={{
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: isActive ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: inst.status === 'online' ? 'var(--success)'
                      : inst.status === 'offline' ? 'var(--error)'
                      : inst.status === 'degraded' ? 'var(--warning)'
                      : '#555',
                  }}
                />
                <span className="flex-1 truncate">{inst.name}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded text-white"
                  style={{ background: ROLE_COLORS[inst.role] ?? '#555', fontSize: '10px' }}
                >
                  {inst.role}
                </span>
              </Link>

              {isActive && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {INSTANCE_NAV.map(nav => {
                    const active = pathname.endsWith(`/${nav.href}`)
                    return (
                      <Link
                        key={nav.href}
                        href={`/instances/${inst.id}/${nav.href}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors"
                        style={{
                          color: active ? 'var(--accent)' : 'var(--text-muted)',
                          background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
                        }}
                      >
                        <nav.icon size={12} />
                        {nav.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        <Link
          href="/instances/new"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors mt-2"
          style={{ color: 'var(--text-muted)' }}
        >
          <Plus size={12} />
          Add instance
        </Link>
      </div>
    </aside>
  )
}
