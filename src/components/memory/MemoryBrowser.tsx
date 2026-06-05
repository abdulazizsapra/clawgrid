'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, Download, Brain, FileText } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

interface MemFile { path: string; size: number; mtime: number; source: string }

export function MemoryBrowser({ instance }: { instance: OpenClawInstance }) {
  const [files, setFiles] = useState<MemFile[]>([])
  const [activePath, setActivePath] = useState<string>('')
  const [content, setContent] = useState<string>('')
  const [contentLoading, setContentLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function sshExec(command: string): Promise<string> {
    const res = await fetch(`/api/ssh/${instance.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'exec', args: { command } }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.stdout ?? ''
  }

  const loadFiles = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const memDir = `${instance.workspacePath}/memory`
      // Query the main.sqlite files table via Python3
      const py = `python3 -c "
import sqlite3, json, os
dbs = ['${memDir}/main.sqlite', '${memDir}/command.sqlite']
seen = {}
for db in dbs:
    if not os.path.exists(db): continue
    try:
        conn = sqlite3.connect(db)
        rows = conn.execute('SELECT path, source, mtime, size FROM files ORDER BY mtime DESC').fetchall()
        for r in rows:
            if r[0] not in seen:
                seen[r[0]] = {'path': r[0], 'source': r[1], 'mtime': r[2], 'size': r[3]}
        conn.close()
    except: pass
print(json.dumps(list(seen.values())))
"`
      const out = await sshExec(py)
      const parsed: MemFile[] = JSON.parse(out.trim() || '[]')
      setFiles(parsed)
      if (parsed.length > 0 && !activePath) {
        setActivePath(parsed[0].path)
        loadContent(parsed[0].path)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setLoading(false)
    }
  }, [instance.id, instance.workspacePath, activePath])

  async function loadContent(path: string) {
    setContentLoading(true)
    try {
      const memDir = `${instance.workspacePath}/memory`
      const py = `python3 -c "
import sqlite3, json, os
dbs = ['${memDir}/main.sqlite', '${memDir}/command.sqlite']
chunks = []
for db in dbs:
    if not os.path.exists(db): continue
    try:
        conn = sqlite3.connect(db)
        rows = conn.execute('SELECT text, start_line FROM chunks WHERE path=? ORDER BY start_line', ('${path}',)).fetchall()
        chunks.extend(rows)
        conn.close()
    except: pass
# Deduplicate and sort
seen_lines = set()
unique = []
for text, sl in sorted(chunks, key=lambda x: x[1]):
    if sl not in seen_lines:
        seen_lines.add(sl)
        unique.append(text)
print('\\n'.join(unique))
"`
      const out = await sshExec(py)
      setContent(out)
    } catch (e) {
      setContent(`Error loading content: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setContentLoading(false)
    }
  }

  useEffect(() => { loadFiles() }, [loadFiles])

  function selectFile(path: string) {
    setActivePath(path)
    setContent('')
    loadContent(path)
  }

  const displayContent = search
    ? content.split('\n').filter(l => l.toLowerCase().includes(search.toLowerCase())).join('\n')
    : content

  function download() {
    if (!content || !activePath) return
    const blob = new Blob([content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = activePath.split('/').pop() ?? 'memory.md'
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
          {files.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>· {files.length} files</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
            <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter lines…"
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, width: 120, color: 'var(--text)', padding: 0, boxShadow: 'none' }}
            />
          </div>
          <button onClick={download} disabled={!content} style={{ padding: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <Download size={13} />
          </button>
          <button onClick={() => { loadFiles(); if (activePath) loadContent(activePath) }} disabled={loading} style={{ padding: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* File list */}
        <div style={{ width: 200, minWidth: 200, flexShrink: 0, overflowY: 'auto', padding: 8, background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
          {loading && <div style={{ padding: '10px', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
          {!loading && files.length === 0 && (
            <div style={{ padding: '10px', fontSize: 12, color: 'var(--text-muted)' }}>
              {error ?? 'No memory files found'}
            </div>
          )}
          {files.map(f => {
            const name = f.path.split('/').pop() ?? f.path
            const active = activePath === f.path
            return (
              <button key={f.path} onClick={() => selectFile(f.path)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 12, textAlign: 'left', background: active ? 'var(--accent-dim)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                <FileText size={11} style={{ flexShrink: 0 }} />
                <div style={{ overflow: 'hidden', minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                    {f.size ? `${(f.size / 1024).toFixed(1)}KB` : ''}{f.source ? ` · ${f.source}` : ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, minWidth: 0 }}>
          {error && <div style={{ fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{error}</div>}
          {contentLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
          {!contentLoading && activePath && !content && !contentLoading && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Empty or no chunks found</div>
          )}
          {!contentLoading && content && (
            <pre style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: "'SF Mono', 'Fira Code', monospace", color: 'var(--text)', margin: 0 }}>
              {displayContent}
            </pre>
          )}
          {!loading && files.length === 0 && !activePath && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, paddingTop: 40, textAlign: 'center' }}>
              No memory files found on this instance
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
