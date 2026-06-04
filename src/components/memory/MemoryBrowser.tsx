'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, Download, Brain, FileText } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

interface MemoryFile {
  path: string
  name: string
  content: string
  size: number
}

const MEMORY_FILES = ['MEMORY.md', 'team-memory.md', 'team-intel.json']

export function MemoryBrowser({ instance }: { instance: OpenClawInstance }) {
  const [files, setFiles] = useState<MemoryFile[]>([])
  const [active, setActive] = useState<string>('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const results: MemoryFile[] = []
      for (const file of MEMORY_FILES) {
        const res = await fetch(`/api/ssh/${instance.id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'exec', args: { command: `cat "${instance.workspacePath}/${file}" 2>/dev/null` } }),
        })
        const data = await res.json()
        if (data.stdout?.trim()) {
          results.push({ path: file, name: file, content: data.stdout, size: data.stdout.length })
        }
      }
      // Scan memory/ subdir
      const scanRes = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exec', args: { command: `find "${instance.workspacePath}/memory" -name "*.md" -o -name "*.json" 2>/dev/null | head -20` } }),
      })
      const scanData = await scanRes.json()
      const extraPaths = (scanData.stdout || '').trim().split('\n').filter(Boolean)
      for (const p of extraPaths) {
        const name = p.split('/').pop() ?? p
        if (results.find(r => r.name === name)) continue
        const fr = await fetch(`/api/ssh/${instance.id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'exec', args: { command: `cat "${p}" 2>/dev/null` } }),
        })
        const fd = await fr.json()
        if (fd.stdout) results.push({ path: p, name, content: fd.stdout, size: fd.stdout.length })
      }
      setFiles(results)
      if (results.length > 0 && !active) setActive(results[0].name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setLoading(false)
    }
  }, [instance.id, instance.workspacePath, active])

  useEffect(() => { load() }, [load])

  const current = files.find(f => f.name === active)
  const displayContent = search
    ? current?.content.split('\n').filter(l => l.toLowerCase().includes(search.toLowerCase())).join('\n') ?? ''
    : current?.content ?? ''

  function download() {
    if (!current) return
    const blob = new Blob([current.content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = current.name
    a.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={15} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600 }}>Memory Browser</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{instance.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
            <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, width: 120, color: 'var(--text)', padding: 0, boxShadow: 'none' }}
            />
          </div>
          <button onClick={download} disabled={!current} title="Download" style={{ padding: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-muted)', cursor: current ? 'pointer' : 'not-allowed' }}>
            <Download size={13} />
          </button>
          <button onClick={load} disabled={loading} title="Refresh" style={{ padding: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* File list */}
        <div style={{ width: 200, minWidth: 200, flexShrink: 0, overflowY: 'auto', padding: '8px', background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
          {loading && (
            <div style={{ padding: '12px 10px', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
          )}
          {!loading && files.length === 0 && (
            <div style={{ padding: '12px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
              {error ? `Error: ${error}` : 'No memory files found'}
            </div>
          )}
          {files.map(f => (
            <button
              key={f.name}
              onClick={() => setActive(f.name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', borderRadius: 7, fontSize: 12, textAlign: 'left',
                background: active === f.name ? 'var(--accent-dim)' : 'transparent',
                color: active === f.name ? 'var(--accent)' : 'var(--text-muted)',
                border: 'none', cursor: 'pointer',
              }}
            >
              <FileText size={11} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, minWidth: 0 }}>
          {error && !files.length && (
            <div style={{ fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              {error}
            </div>
          )}
          {current ? (
            <pre style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: "'SF Mono', 'Fira Code', monospace", color: 'var(--text)' }}>
              {displayContent || <span style={{ color: 'var(--text-dim)' }}>Empty file</span>}
            </pre>
          ) : !loading && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, paddingTop: 40, textAlign: 'center' }}>
              {files.length > 0 ? 'Select a file' : 'No memory files found on this instance'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
