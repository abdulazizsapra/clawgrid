'use client'
import { useState } from 'react'
import { BookOpen, Copy, Check } from 'lucide-react'

// Simple markdown → HTML renderer (handles the subset used in ONBOARDING.md)
function renderMd(md: string): React.ReactNode {
  const lines = md.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      nodes.push(<CodeBlock key={i} lang={lang} code={codeLines.join('\n')} />)
      i++
      continue
    }

    // Headings
    if (line.startsWith('# ')) { nodes.push(<h1 key={i} style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: '32px 0 12px', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>{inlineMd(line.slice(2))}</h1>); i++; continue }
    if (line.startsWith('## ')) { nodes.push(<h2 key={i} style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', margin: '28px 0 10px' }}>{inlineMd(line.slice(3))}</h2>); i++; continue }
    if (line.startsWith('### ')) { nodes.push(<h3 key={i} style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '20px 0 8px' }}>{inlineMd(line.slice(4))}</h3>); i++; continue }

    // HR
    if (line === '---') { nodes.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />); i++; continue }

    // Table
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      nodes.push(<MdTable key={i} lines={tableLines} />)
      continue
    }

    // Unordered list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: React.ReactNode[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i} style={{ margin: '4px 0', lineHeight: 1.65 }}>{inlineMd(lines[i].slice(2))}</li>)
        i++
      }
      nodes.push(<ul key={i} style={{ margin: '8px 0', paddingLeft: 22, color: 'var(--text)' }}>{items}</ul>)
      continue
    }

    // Empty line
    if (line.trim() === '') { i++; continue }

    // Paragraph
    nodes.push(<p key={i} style={{ margin: '6px 0', lineHeight: 1.7, color: 'var(--text)', fontSize: 14 }}>{inlineMd(line)}</p>)
    i++
  }

  return <>{nodes}</>
}

function inlineMd(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const s = m[0]
    if (s.startsWith('`')) parts.push(<code key={m.index} style={{ background: 'var(--surface2)', color: 'var(--accent)', padding: '1px 5px', borderRadius: 4, fontSize: '0.88em', fontFamily: "'SF Mono','Fira Code',monospace" }}>{s.slice(1, -1)}</code>)
    else if (s.startsWith('**')) parts.push(<strong key={m.index} style={{ fontWeight: 600, color: 'var(--text)' }}>{s.slice(2, -2)}</strong>)
    else parts.push(<em key={m.index}>{s.slice(1, -1)}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
  }
  return (
    <div style={{ margin: '14px 0', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d1117', padding: '7px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{lang || 'code'}</span>
        <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--success)' : 'var(--text-dim)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '14px 16px', background: '#111318', overflow: 'auto', fontSize: 12.5, lineHeight: 1.65, color: '#e8eaf0', fontFamily: "'SF Mono','Fira Code',monospace", whiteSpace: 'pre' }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function MdTable({ lines }: { lines: string[] }) {
  const rows = lines.filter(l => !l.replace(/\|/g, '').replace(/-/g, '').trim() === false || !l.match(/^\|[-| ]+\|$/))
    .filter(l => !l.match(/^\|[-| ]+\|$/))
  if (rows.length === 0) return null
  const header = rows[0].split('|').map(c => c.trim()).filter(Boolean)
  const body = rows.slice(1)

  return (
    <div style={{ overflowX: 'auto', margin: '14px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--surface2)' }}>
            {header.map((h, i) => <th key={i} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{inlineMd(h)}</th>)}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => {
            const cells = row.split('|').map(c => c.trim()).filter(Boolean)
            return (
              <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                {cells.map((c, ci) => <td key={ci} style={{ padding: '8px 14px', color: 'var(--text)', verticalAlign: 'top' }}>{inlineMd(c)}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function DocsViewer({ markdown }: { markdown: string }) {
  const [search, setSearch] = useState('')

  // Simple heading-based TOC
  const toc = markdown.split('\n')
    .filter(l => l.startsWith('## ') || l.startsWith('### '))
    .map(l => ({
      level: l.startsWith('### ') ? 3 : 2,
      text: l.replace(/^#{2,3} /, ''),
      id: l.replace(/^#{2,3} /, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    }))

  const displayMd = search
    ? markdown.split('\n').filter(l => l.toLowerCase().includes(search.toLowerCase())).join('\n')
    : markdown

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* TOC sidebar */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto', background: 'var(--surface)', padding: '16px 0' }}>
        <div style={{ padding: '0 14px 12px', display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
          <BookOpen size={13} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Docs</span>
        </div>
        {toc.map((h, i) => (
          <a key={i} href={`#${h.id}`} style={{
            display: 'block', padding: `5px ${h.level === 3 ? 28 : 14}px`,
            fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none',
            lineHeight: 1.4,
          }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            {h.text}
          </a>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 48px', maxWidth: 860 }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', marginBottom: 28, maxWidth: 320 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search docs…" style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', width: '100%', padding: 0 }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 16, lineHeight: 1 }}>×</button>}
        </div>

        {renderMd(displayMd)}
      </div>
    </div>
  )
}
