'use client'
import { useState, useEffect, useRef } from 'react'
import { Save, Upload, RotateCcw, Palette, Monitor, Bell, Shield, ChevronRight } from 'lucide-react'

// ─── Theme presets ────────────────────────────────────────────────────────────

const THEMES = [
  {
    id: 'dark',
    label: 'Dark',
    preview: '#0d0d0f',
    vars: {
      '--bg': '#0d0d0f', '--surface': '#16171a', '--surface2': '#1e2024', '--surface3': '#26282e',
      '--border': '#2e3138', '--border-focus': '#4a5060', '--text': '#e8eaf0',
      '--text-muted': '#7a7f8e', '--text-dim': '#4a4f5e', '--accent': '#3b82f6',
      '--accent-hover': '#2563eb', '--accent-dim': 'rgba(59,130,246,0.12)',
      '--success': '#22c55e', '--warning': '#f59e0b', '--error': '#ef4444',
      '--error-dim': 'rgba(239,68,68,0.1)',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    preview: '#050508',
    vars: {
      '--bg': '#050508', '--surface': '#0e0f14', '--surface2': '#14151c', '--surface3': '#1c1d28',
      '--border': '#252633', '--border-focus': '#3d3f55', '--text': '#e2e4f0',
      '--text-muted': '#7074a0', '--text-dim': '#404263', '--accent': '#818cf8',
      '--accent-hover': '#6366f1', '--accent-dim': 'rgba(129,140,248,0.12)',
      '--success': '#34d399', '--warning': '#fbbf24', '--error': '#f87171',
      '--error-dim': 'rgba(248,113,113,0.1)',
    },
  },
  {
    id: 'forest',
    label: 'Forest',
    preview: '#0a0f0d',
    vars: {
      '--bg': '#0a0f0d', '--surface': '#111a16', '--surface2': '#182420', '--surface3': '#1e2e28',
      '--border': '#2a3d34', '--border-focus': '#3d5c4e', '--text': '#e0ede8',
      '--text-muted': '#6b8f7e', '--text-dim': '#3d5247', '--accent': '#34d399',
      '--accent-hover': '#10b981', '--accent-dim': 'rgba(52,211,153,0.12)',
      '--success': '#34d399', '--warning': '#fbbf24', '--error': '#f87171',
      '--error-dim': 'rgba(248,113,113,0.1)',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    preview: '#0f172a',
    vars: {
      '--bg': '#0f172a', '--surface': '#1e293b', '--surface2': '#263347', '--surface3': '#2e3e55',
      '--border': '#334155', '--border-focus': '#4a5c70', '--text': '#e2e8f0',
      '--text-muted': '#94a3b8', '--text-dim': '#4e6480', '--accent': '#38bdf8',
      '--accent-hover': '#0ea5e9', '--accent-dim': 'rgba(56,189,248,0.12)',
      '--success': '#4ade80', '--warning': '#fb923c', '--error': '#f87171',
      '--error-dim': 'rgba(248,113,113,0.1)',
    },
  },
]

const ACCENT_COLORS = [
  { id: 'blue',   label: 'Blue',   color: '#3b82f6', dim: 'rgba(59,130,246,0.12)' },
  { id: 'violet', label: 'Violet', color: '#8b5cf6', dim: 'rgba(139,92,246,0.12)' },
  { id: 'emerald',label: 'Emerald',color: '#10b981', dim: 'rgba(16,185,129,0.12)' },
  { id: 'rose',   label: 'Rose',   color: '#f43f5e', dim: 'rgba(244,63,94,0.12)' },
  { id: 'amber',  label: 'Amber',  color: '#f59e0b', dim: 'rgba(245,158,11,0.12)' },
  { id: 'cyan',   label: 'Cyan',   color: '#06b6d4', dim: 'rgba(6,182,212,0.12)' },
]

const PANEL_SETTINGS_KEY = 'clawgrid_panel_settings'

interface PanelConfig {
  panelName: string
  themeId: string
  accentId: string
  logoUrl: string  // '' = use default /logo.png
  sidebarCollapsed: boolean
  showInstanceIp: boolean
}

const DEFAULTS: PanelConfig = {
  panelName: 'ClawGrid',
  themeId: 'dark',
  accentId: 'blue',
  logoUrl: '',
  sidebarCollapsed: false,
  showInstanceIp: true,
}

function applyTheme(themeId: string, accentId: string) {
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0]
  const accent = ACCENT_COLORS.find(a => a.id === accentId)
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  if (accent) {
    root.style.setProperty('--accent', accent.color)
    root.style.setProperty('--accent-hover', accent.color)
    root.style.setProperty('--accent-dim', accent.dim)
  }
}

export function PanelSettings() {
  const [cfg, setCfg] = useState<PanelConfig>(DEFAULTS)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PANEL_SETTINGS_KEY)
      if (stored) {
        const parsed = { ...DEFAULTS, ...JSON.parse(stored) }
        setCfg(parsed)
        applyTheme(parsed.themeId, parsed.accentId)
      }
    } catch { /* ignore */ }
  }, [])

  function update<K extends keyof PanelConfig>(key: K, val: PanelConfig[K]) {
    setCfg(prev => {
      const next = { ...prev, [key]: val }
      if (key === 'themeId' || key === 'accentId') {
        applyTheme(key === 'themeId' ? (val as string) : prev.themeId, key === 'accentId' ? (val as string) : prev.accentId)
      }
      return next
    })
  }

  function save() {
    localStorage.setItem(PANEL_SETTINGS_KEY, JSON.stringify(cfg))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function reset() {
    setCfg(DEFAULTS)
    applyTheme(DEFAULTS.themeId, DEFAULTS.accentId)
    localStorage.removeItem(PANEL_SETTINGS_KEY)
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      update('logoUrl', dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const currentTheme = THEMES.find(t => t.id === cfg.themeId) ?? THEMES[0]
  const currentAccent = ACCENT_COLORS.find(a => a.id === cfg.accentId) ?? ACCENT_COLORS[0]

  const section = (icon: React.ReactNode, title: string, desc: string) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  )

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '9px 12px', fontSize: 14, color: 'var(--text)',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '22px 24px', marginBottom: 16,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Panel Settings</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>Customize ClawGrid appearance and behaviour</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            <RotateCcw size={13} /> Reset
          </button>
          <button onClick={save} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Save size={13} /> {saved ? '✓ Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 28px', maxWidth: 720 }}>

        {/* ── Identity ── */}
        <div style={card}>
          {section(<Monitor size={16} style={{ color: 'var(--accent)' }} />, 'Identity', 'Panel name and logo shown in the sidebar and browser tab')}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Name */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 7 }}>Panel Name</label>
              <input
                style={inputStyle}
                value={cfg.panelName}
                onChange={e => update('panelName', e.target.value)}
                placeholder="ClawGrid"
              />
            </div>

            {/* Logo upload */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 7 }}>Logo</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cfg.logoUrl || '/logo.png'} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                    <Upload size={12} /> Upload new logo
                  </button>
                  {cfg.logoUrl && (
                    <button onClick={() => update('logoUrl', '')} style={{ fontSize: 11, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                      ↩ Reset to default
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Theme ── */}
        <div style={card}>
          {section(<Palette size={16} style={{ color: 'var(--accent)' }} />, 'Theme', 'Choose a colour scheme for the entire panel')}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {THEMES.map(t => (
              <button key={t.id} onClick={() => update('themeId', t.id)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${cfg.themeId === t.id ? 'var(--accent)' : 'var(--border)'}`,
                background: cfg.themeId === t.id ? 'var(--accent-dim)' : 'var(--surface2)',
              }}>
                <div style={{ width: 48, height: 32, borderRadius: 7, background: t.preview, border: '1px solid rgba(255,255,255,0.1)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${t.vars['--surface']} 40%, ${t.vars['--accent']} 100%)`, opacity: 0.6 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: cfg.themeId === t.id ? 600 : 400, color: cfg.themeId === t.id ? 'var(--accent)' : 'var(--text-muted)' }}>{t.label}</span>
              </button>
            ))}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 10 }}>Accent Colour</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ACCENT_COLORS.map(a => (
                <button key={a.id} onClick={() => update('accentId', a.id)} title={a.label} style={{
                  width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                  background: a.color,
                  border: cfg.accentId === a.id ? '3px solid var(--text)' : '3px solid transparent',
                  boxShadow: cfg.accentId === a.id ? `0 0 0 2px ${a.color}` : 'none',
                  transition: 'all 0.15s',
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Display ── */}
        <div style={card}>
          {section(<Bell size={16} style={{ color: 'var(--accent)' }} />, 'Display Preferences', 'Control what information is shown across the panel')}

          {[
            { key: 'showInstanceIp' as const, label: 'Show instance IP addresses', desc: 'Display SSH host IPs on fleet cards and sidebars' },
            { key: 'sidebarCollapsed' as const, label: 'Start with sidebar collapsed', desc: 'Collapse the instance navigation on first load' },
          ].map(opt => (
            <div key={opt.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{opt.desc}</div>
              </div>
              <button
                onClick={() => update(opt.key, !cfg[opt.key])}
                style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: cfg[opt.key] ? 'var(--accent)' : 'var(--surface3)', position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginLeft: 16 }}
              >
                <span style={{ position: 'absolute', top: 4, left: cfg[opt.key] ? 22 : 4, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
            </div>
          ))}
        </div>

        {/* ── Auth note ── */}
        <div style={{ ...card, background: 'var(--accent-dim)', border: '1px solid rgba(59,130,246,0.2)' }}>
          {section(<Shield size={16} style={{ color: 'var(--accent)' }} />, 'Authentication', 'Password protection is configured via environment variables')}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface)', borderRadius: 9, border: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Panel password</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Set <code style={{ fontSize: 11, color: 'var(--accent)' }}>PANEL_PASSWORD</code> and <code style={{ fontSize: 11, color: 'var(--accent)' }}>PANEL_SECRET</code> in <code style={{ fontSize: 11 }}>.env.local</code>
              </div>
            </div>
            <a href="/docs#authentication" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
              Docs <ChevronRight size={12} />
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
