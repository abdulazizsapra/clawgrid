'use client'
import { sshExec } from '@/lib/utils'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, Download, Brain, FileText, Lightbulb, AlertTriangle, TrendingUp } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

interface MemFile { path: string; size: number; mtime: number; source: string }

interface AnalysisSuggestion {
  type: 'warning' | 'info' | 'tip'
  title: string
  detail: string
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}

function fmtTime(ms: number) {
  if (!ms) return '—'
  const diff = Date.now() - ms * 1000
  if (diff < 0) return new Date(ms * 1000).toLocaleDateString()
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(ms * 1000).toLocaleDateString()
}

// ─── Analysis engine ──────────────────────────────────────────────────────────

function analyzeMemory(files: MemFile[]): { suggestions: AnalysisSuggestion[]; stats: Record<string, unknown> } {
  const suggestions: AnalysisSuggestion[] = []
  const now = Date.now() / 1000

  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0)
  const totalFiles = files.length
  const bySource: Record<string, MemFile[]> = {}
  for (const f of files) {
    const src = f.source || 'unknown'
    if (!bySource[src]) bySource[src] = []
    bySource[src].push(f)
  }

  // Stale files (not updated in 30+ days)
  const staleThreshold = 30 * 86400
  const staleFiles = files.filter(f => f.mtime && (now - f.mtime) > staleThreshold)
  if (staleFiles.length > 0) {
    suggestions.push({
      type: 'warning',
      title: `${staleFiles.length} stale memory file${staleFiles.length > 1 ? 's' : ''} (30+ days old)`,
      detail: `Files not updated recently may contain outdated context. Consider reviewing: ${staleFiles.slice(0, 3).map(f => f.path.split('/').pop()).join(', ')}${staleFiles.length > 3 ? ` +${staleFiles.length - 3} more` : ''}.`,
    })
  }

  // Large files
  const largeFiles = files.filter(f => f.size > 50000)
  if (largeFiles.length > 0) {
    suggestions.push({
      type: 'warning',
      title: `${largeFiles.length} large memory file${largeFiles.length > 1 ? 's' : ''} (>50KB)`,
      detail: `Large memory files can slow retrieval and increase token usage. The largest: ${largeFiles.sort((a,b)=>b.size-a.size).slice(0,2).map(f => `${f.path.split('/').pop()} (${fmtSize(f.size)})`).join(', ')}.`,
    })
  }

  // Total size check
  if (totalSize > 500000) {
    suggestions.push({
      type: 'warning',
      title: `Total memory size is ${fmtSize(totalSize)}`,
      detail: `High total memory size increases context load per agent turn. Consider archiving or removing memories that are no longer relevant.`,
    })
  }

  // Good practices / positive signals
  if (totalFiles > 0 && staleFiles.length === 0) {
    suggestions.push({
      type: 'info',
      title: 'All memory files updated recently',
      detail: `All ${totalFiles} memory files were updated within the last 30 days — memory is fresh.`,
    })
  }

  // Multiple sources
  const sourceCount = Object.keys(bySource).length
  if (sourceCount > 1) {
    suggestions.push({
      type: 'tip',
      title: `Memory spans ${sourceCount} sources`,
      detail: `Files from: ${Object.keys(bySource).join(', ')}. Ensure each agent only loads the memory it needs to avoid unnecessary token usage.`,
    })
  }

  // No memory
  if (totalFiles === 0) {
    suggestions.push({
      type: 'info',
      title: 'No memory files found',
      detail: 'The agent has no persisted memory. Memory files are created automatically as the agent learns and stores context.',
    })
  }

  // Consolidation suggestion
  const smallFiles = files.filter(f => f.size < 200)
  if (smallFiles.length > 5) {
    suggestions.push({
      type: 'tip',
      title: `${smallFiles.length} small fragments could be consolidated`,
      detail: `Many tiny memory files (${smallFiles.length} files under 200B) increase overhead. Consider asking the agent to consolidate related memories.`,
    })
  }

  const stats = {
    totalFiles,
    totalSize,
    staleCount: staleFiles.length,
    largeCount: largeFiles.length,
    sources: sourceCount,
    newestMtime: files.length > 0 ? Math.max(...files.map(f => f.mtime || 0)) : 0,
    oldestMtime: files.length > 0 ? Math.min(...files.filter(f => f.mtime).map(f => f.mtime)) : 0,
  }

  return { suggestions, stats }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MemoryBrowser({ instance }: { instance: OpenClawInstance }) {
  const [files, setFiles] = useState<MemFile[]>([])
  const [activePath, setActivePath] = useState<string>('')
  const [content, setContent] = useState<string>('')
  const [contentLoading, setContentLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'browse' | 'analyze'>('browse')
  const [analysis, setAnalysis] = useState<ReturnType<typeof analyzeMemory> | null>(null)

  const loadFiles = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const memDir = `${instance.workspacePath}/memory`
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
      const out = await sshExec(instance.id, py)
      const parsed: MemFile[] = JSON.parse(out.trim() || '[]')
      setFiles(parsed)
      setAnalysis(analyzeMemory(parsed))
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
seen_lines = set()
unique = []
for text, sl in sorted(chunks, key=lambda x: x[1]):
    if sl not in seen_lines:
        seen_lines.add(sl)
        unique.append(text)
print('\\n'.join(unique))
"`
      const out = await sshExec(instance.id, py)
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

  const suggestionIcon = (type: AnalysisSuggestion['type']) => {
    if (type === 'warning') return <AlertTriangle size={13} style={{ color: 'var(--warning)', flexShrink: 0 }} />
    if (type === 'tip') return <Lightbulb size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
    return <TrendingUp size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
  }

  const suggestionBg = (type: AnalysisSuggestion['type']) => {
    if (type === 'warning') return 'rgba(245,158,11,0.07)'
    if (type === 'tip') return 'rgba(59,130,246,0.07)'
    return 'rgba(34,197,94,0.07)'
  }

  const suggestionBorder = (type: AnalysisSuggestion['type']) => {
    if (type === 'warning') return 'rgba(245,158,11,0.3)'
    if (type === 'tip') return 'rgba(59,130,246,0.3)'
    return 'rgba(34,197,94,0.3)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Memory</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{instance.name}</span>
          {files.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>· {files.length} files</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 7, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <button onClick={() => setTab('browse')} style={{ padding: '4px 12px', fontSize: 12, border: 'none', cursor: 'pointer', background: tab === 'browse' ? 'var(--accent-dim)' : 'transparent', color: tab === 'browse' ? 'var(--accent)' : 'var(--text-muted)', fontWeight: tab === 'browse' ? 600 : 400 }}>Browse</button>
            <button onClick={() => setTab('analyze')} style={{ padding: '4px 12px', fontSize: 12, border: 'none', cursor: 'pointer', background: tab === 'analyze' ? 'var(--accent-dim)' : 'transparent', color: tab === 'analyze' ? 'var(--accent)' : 'var(--text-muted)', fontWeight: tab === 'analyze' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Lightbulb size={11} />Analyze
              {analysis && analysis.suggestions.filter(s => s.type === 'warning').length > 0 && (
                <span style={{ fontSize: 9, background: 'var(--warning)', color: '#000', borderRadius: 8, padding: '0 4px', fontWeight: 700 }}>
                  {analysis.suggestions.filter(s => s.type === 'warning').length}
                </span>
              )}
            </button>
          </div>
          {tab === 'browse' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px' }}>
                <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter lines…"
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, width: 100, color: 'var(--text)', padding: 0 }} />
              </div>
              <button onClick={download} disabled={!content} style={{ padding: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <Download size={12} />
              </button>
            </>
          )}
          <button onClick={() => { loadFiles(); if (activePath) loadContent(activePath) }} disabled={loading} style={{ padding: 5, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Browse tab */}
      {tab === 'browse' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* File list */}
          <div style={{ width: 200, minWidth: 200, flexShrink: 0, overflowY: 'auto', padding: 8, background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
            {loading && <div style={{ padding: '10px', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && files.length === 0 && <div style={{ padding: '10px', fontSize: 12, color: 'var(--text-muted)' }}>{error ?? 'No memory files'}</div>}
            {files.map(f => {
              const name = f.path.split('/').pop() ?? f.path
              const active = activePath === f.path
              return (
                <button key={f.path} onClick={() => selectFile(f.path)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '7px 9px', borderRadius: 7, fontSize: 12, textAlign: 'left', background: active ? 'var(--accent-dim)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                  <FileText size={11} style={{ flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden', minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                      {f.size ? fmtSize(f.size) : ''}
                      {f.mtime ? ` · ${fmtTime(f.mtime)}` : ''}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Content viewer */}
          <div style={{ flex: 1, overflow: 'auto', padding: 18, minWidth: 0 }}>
            {error && <div style={{ fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>{error}</div>}
            {contentLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
            {!contentLoading && activePath && !content && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Empty or no chunks found</div>}
            {!contentLoading && content && (
              <pre style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: "'SF Mono','Fira Code',monospace", color: 'var(--text)', margin: 0 }}>
                {displayContent}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Analyze tab */}
      {tab === 'analyze' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analyzing memory…</div>}

          {analysis && !loading && (
            <>
              {/* Stats overview */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
                {[
                  { label: 'Total Files', value: String(analysis.stats.totalFiles) },
                  { label: 'Total Size', value: fmtSize(analysis.stats.totalSize as number) },
                  { label: 'Sources', value: String(analysis.stats.sources) },
                  { label: 'Stale Files', value: String(analysis.stats.staleCount), bad: (analysis.stats.staleCount as number) > 0 },
                  { label: 'Newest', value: analysis.stats.newestMtime ? fmtTime(analysis.stats.newestMtime as number) : '—' },
                  { label: 'Oldest', value: analysis.stats.oldestMtime ? fmtTime(analysis.stats.oldestMtime as number) : '—' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.bad ? 'var(--warning)' : 'var(--text)' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Suggestions */}
              <div style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                  Analysis &amp; Suggestions
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {analysis.suggestions.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10, background: suggestionBg(s.type), border: `1px solid ${suggestionBorder(s.type)}` }}>
                      <div style={{ paddingTop: 1 }}>{suggestionIcon(s.type)}</div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>{s.title}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>{s.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* File table */}
              {files.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                    All Memory Files
                  </p>
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 100px', padding: '7px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <span>Path</span><span>Size</span><span>Source</span><span>Updated</span>
                    </div>
                    {files.map(f => (
                      <div key={f.path} onClick={() => { setTab('browse'); selectFile(f.path) }} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 100px', padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{f.path}</span>
                        <span style={{ color: f.size > 50000 ? 'var(--warning)' : 'var(--text-muted)' }}>{fmtSize(f.size || 0)}</span>
                        <span style={{ color: 'var(--text-dim)' }}>{f.source || '—'}</span>
                        <span style={{ color: 'var(--text-dim)' }}>{f.mtime ? fmtTime(f.mtime) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
