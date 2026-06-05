'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, MessageSquare, Clock, Brain,
  DollarSign, Radio, Settings, Plus, Terminal, Zap, History, Package, Activity, Shield, Sparkles
} from 'lucide-react'
import type { OpenClawInstance } from '@/types'

const INSTANCE_NAV = [
  { href: 'chat',     icon: MessageSquare, label: 'Chat' },
  { href: 'sessions', icon: History,       label: 'Sessions' },
  { href: 'health',   icon: Activity,      label: 'Health' },
  { href: 'security', icon: Shield,        label: 'Security' },
  { href: 'optimize', icon: Sparkles,      label: 'Self-Improve' },
  { href: 'agents',   icon: Zap,           label: 'Agents' },
  { href: 'crons',    icon: Clock,         label: 'Crons' },
  { href: 'skills',   icon: Package,       label: 'Skills' },
  { href: 'memory',   icon: Brain,         label: 'Memory' },
  { href: 'cost',     icon: DollarSign,    label: 'Cost' },
  { href: 'channels', icon: Radio,         label: 'Channels' },
  { href: 'logs',     icon: Terminal,      label: 'Logs' },
  { href: 'settings', icon: Settings,      label: 'Settings' },
]

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  command: { bg: 'rgba(59,130,246,0.2)',  text: '#60a5fa' },
  supply:  { bg: 'rgba(168,85,247,0.2)',  text: '#c084fc' },
  voice:   { bg: 'rgba(34,197,94,0.2)',   text: '#4ade80' },
}

const STATUS_DOT: Record<string, string> = {
  online:  '#22c55e',
  offline: '#ef4444',
  degraded:'#f59e0b',
  unknown: '#555',
}

export function Sidebar({ instances }: { instances: OpenClawInstance[] }) {
  const pathname = usePathname()
  const activeInstance = instances.find(i => pathname.includes(`/instances/${i.id}`))

  return (
    <aside
      style={{
        width: '220px',
        minWidth: '220px',
        maxWidth: '220px',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <img src="/logo.png" alt="ClawGrid" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>ClawGrid</span>
      </div>

      {/* Top nav links */}
      <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Link href="/fleet" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none', background: pathname === '/fleet' ? 'var(--accent)' : 'transparent', color: pathname === '/fleet' ? 'white' : 'var(--text-muted)', transition: 'all 0.15s' }}>
          <LayoutDashboard size={14} /><span>Fleet Overview</span>
        </Link>
        <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none', background: pathname === '/settings' ? 'var(--accent-dim)' : 'transparent', color: pathname === '/settings' ? 'var(--accent)' : 'var(--text-dim)', transition: 'all 0.15s' }}>
          <Settings size={14} /><span>Panel Settings</span>
        </Link>
      </div>

      {/* Instances */}
      <div style={{ padding: '4px 10px 10px', flex: 1 }}>
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-dim)', padding: '8px 10px 6px', textTransform: 'uppercase' }}>
          Instances
        </p>

        {instances.map(inst => {
          const isActive = activeInstance?.id === inst.id
          const roleStyle = ROLE_COLORS[inst.role]
          const dotColor = STATUS_DOT[inst.status] ?? STATUS_DOT.unknown

          return (
            <div key={inst.id} style={{ marginBottom: 2 }}>
              <Link
                href={`/instances/${inst.id}/chat`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  background: isActive ? 'var(--surface3)' : 'transparent',
                  transition: 'background 0.15s',
                  overflow: 'hidden',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: isActive ? 'var(--text)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inst.name}
                </span>
                {roleStyle && (
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: roleStyle.bg, color: roleStyle.text, flexShrink: 0, fontWeight: 500 }}>
                    {inst.role.slice(0, 3)}
                  </span>
                )}
              </Link>

              {isActive && (
                <div style={{ marginLeft: 12, marginTop: 2, marginBottom: 4 }}>
                  {INSTANCE_NAV.map(nav => {
                    const active = pathname.endsWith(`/${nav.href}`)
                    return (
                      <Link
                        key={nav.href}
                        href={`/instances/${inst.id}/${nav.href}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '6px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          textDecoration: 'none',
                          color: active ? 'var(--accent)' : 'var(--text-muted)',
                          background: active ? 'var(--accent-dim)' : 'transparent',
                          transition: 'all 0.15s',
                        }}
                      >
                        <nav.icon size={12} />
                        <span>{nav.label}</span>
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            borderRadius: 8,
            fontSize: 12,
            textDecoration: 'none',
            color: 'var(--text-dim)',
            marginTop: 4,
          }}
        >
          <Plus size={12} />
          <span>Add instance</span>
        </Link>
      </div>

      {/* Logout — only shown when auth is enabled */}
      <LogoutButton />
    </aside>
  )
}

function LogoutButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Check if auth is active by pinging the login page
    fetch('/api/auth/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.authEnabled) setVisible(true) })
      .catch(() => {})
  }, [])

  if (!visible) return null

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <div style={{ padding: '10px 10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
      <button
        onClick={logout}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
          background: 'transparent', border: 'none', color: 'var(--text-dim)',
          textAlign: 'left',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span>Sign out</span>
      </button>
    </div>
  )
}
