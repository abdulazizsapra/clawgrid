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
    setLoading(true)
    setError(null)
    try {
      const results: MemoryFile[] = []
      for (const file of MEMORY_FILES) {
        const res = await fetch(`/api/ssh/${instance.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'exec',
            args: { command: `cat "${instance.workspacePath}/${file}" 2>/dev/null && echo "__SIZE__$(wc -c < "${instance.workspacePath}/${file}" 2>/dev/null)"` },
          }),
        })
        const data = await res.json()
        if (data.stdout && data.code === 0) {
          const parts = data.stdout.split('__SIZE__')
          results.push({
            path: file,
            name: file,
            content: parts[0] ?? '',
            size: parseInt(parts[1] ?? '0', 10) || 0,
          })
        }
      }
      // Also scan for any .md files in memory/ subdir
      const scanRes = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'exec',
          args: { command: `find "${instance.workspacePath}/memory" -name "*.md" -o -name "*.json" 2>/dev/null | head -20` },
        }),
      })
      const scanData = await scanRes.json()
      const extraPaths = (scanData.stdout || '').trim().split('\n').filter(Boolean)
      for (const p of extraPaths) {
        const name = p.split('/').pop() ?? p
        if (results.find(r => r.name === name)) continue
        const fr = await fetch(`/api/ssh/${instance.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Brain size={16} style={{ color: 'var(--accent)' }} />
          <span className="font-semibold">Memory Browser</span>
          <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>{instance.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <Search size={12} style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="bg-transparent outline-none text-xs w-32"
              style={{ color: 'var(--text)' }}
            />
          </div>
          <button onClick={download} disabled={!current} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
            <Download size={13} />
          </button>
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-48 shrink-0 overflow-y-auto p-2 space-y-1" style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
          {files.map(f => (
            <button
              key={f.name}
              onClick={() => setActive(f.name)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors"
              style={{
                background: active === f.name ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: active === f.name ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              <FileText size={11} />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
          {!loading && files.length === 0 && (
            <p className="text-xs px-3 py-2" style={{ color: 'var(--text-muted)' }}>No memory files found</p>
          )}
        </div>

        <div className="flex-1 overflow-auto p-5">
          {error && <p className="text-sm mb-4" style={{ color: 'var(--error)' }}>{error}</p>}
          {loading && <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>}
          {current && (
            <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono" style={{ color: 'var(--text)' }}>
              {displayContent || <span style={{ color: 'var(--text-muted)' }}>Empty file</span>}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
