'use client'
import { useEffect } from 'react'

const PANEL_SETTINGS_KEY = 'clawgrid_panel_settings'

const THEMES: Record<string, Record<string, string>> = {
  dark: { '--bg': '#0d0d0f', '--surface': '#16171a', '--surface2': '#1e2024', '--surface3': '#26282e', '--border': '#2e3138', '--border-focus': '#4a5060', '--text': '#e8eaf0', '--text-muted': '#7a7f8e', '--text-dim': '#4a4f5e', '--success': '#22c55e', '--warning': '#f59e0b', '--error': '#ef4444', '--error-dim': 'rgba(239,68,68,0.1)' },
  midnight: { '--bg': '#050508', '--surface': '#0e0f14', '--surface2': '#14151c', '--surface3': '#1c1d28', '--border': '#252633', '--border-focus': '#3d3f55', '--text': '#e2e4f0', '--text-muted': '#7074a0', '--text-dim': '#404263', '--success': '#34d399', '--warning': '#fbbf24', '--error': '#f87171', '--error-dim': 'rgba(248,113,113,0.1)' },
  forest: { '--bg': '#0a0f0d', '--surface': '#111a16', '--surface2': '#182420', '--surface3': '#1e2e28', '--border': '#2a3d34', '--border-focus': '#3d5c4e', '--text': '#e0ede8', '--text-muted': '#6b8f7e', '--text-dim': '#3d5247', '--success': '#34d399', '--warning': '#fbbf24', '--error': '#f87171', '--error-dim': 'rgba(248,113,113,0.1)' },
  slate: { '--bg': '#0f172a', '--surface': '#1e293b', '--surface2': '#263347', '--surface3': '#2e3e55', '--border': '#334155', '--border-focus': '#4a5c70', '--text': '#e2e8f0', '--text-muted': '#94a3b8', '--text-dim': '#4e6480', '--success': '#4ade80', '--warning': '#fb923c', '--error': '#f87171', '--error-dim': 'rgba(248,113,113,0.1)' },
}

const ACCENTS: Record<string, { color: string; dim: string }> = {
  blue:    { color: '#3b82f6', dim: 'rgba(59,130,246,0.12)' },
  violet:  { color: '#8b5cf6', dim: 'rgba(139,92,246,0.12)' },
  emerald: { color: '#10b981', dim: 'rgba(16,185,129,0.12)' },
  rose:    { color: '#f43f5e', dim: 'rgba(244,63,94,0.12)' },
  amber:   { color: '#f59e0b', dim: 'rgba(245,158,11,0.12)' },
  cyan:    { color: '#06b6d4', dim: 'rgba(6,182,212,0.12)' },
}

export function ThemeLoader() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PANEL_SETTINGS_KEY)
      if (!stored) return
      const cfg = JSON.parse(stored)
      const root = document.documentElement
      const theme = THEMES[cfg.themeId]
      if (theme) Object.entries(theme).forEach(([k, v]) => root.style.setProperty(k, v))
      const accent = ACCENTS[cfg.accentId]
      if (accent) {
        root.style.setProperty('--accent', accent.color)
        root.style.setProperty('--accent-hover', accent.color)
        root.style.setProperty('--accent-dim', accent.dim)
      }
    } catch { /* ignore */ }
  }, [])
  return null
}
