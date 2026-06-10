'use client'
import { sshExec } from '@/lib/utils'
import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Zap, User, Clock, Wrench, CheckCircle, XCircle,
  Shield, LayoutGrid, Activity, ChevronRight, MessageSquare,
  GitBranch, ArrowRight, X, Bot
} from 'lucide-react'
import type { OpenClawInstance } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionSnap {
  id: string
  mtime: number          // unix epoch seconds
  msg_count: number
  first_ts: string
  last_ts: string
  task: string           // first user message snippet
}

interface AgentNode {
  id: string
  is_active: boolean     // last session < 30 min ago
  parent_id: string | null
  description: string
  session_count: number
  sessions: SessionSnap[]
  created_at: string     // earliest known timestamp
  last_active: string    // latest known timestamp
  last_task: string      // task from most recent session
  // enriched from openclaw.json
  name?: string
  role?: string
}

interface ToolConfig {
  safeBins: string[]
  trustedDirs: string[]
  fsWorkspaceOnly: boolean
  execAsk: string
  execSecurity: string
  byProvider: Record<string, { deny?: string[]; allow?: string[] }>
  skills: Record<string, { enabled: boolean }>
}

// ─── Discovery script ─────────────────────────────────────────────────────────
// Runs on the remote VM: scans agents/ (including nested), tasks/, parses
// session JSONL for timestamps and task descriptions, checks for parent refs.

function buildDiscoveryScript(wp: string): string {
  return `python3 - <<'PYEOF'
import json, sys
from pathlib import Path
from datetime import datetime, timezone

def get_ts(m):
    return m.get('timestamp') or m.get('ts') or ''

def parse_sessions(agent_dir):
    sess_dir = agent_dir / 'sessions'
    sessions_data = []
    if not sess_dir.exists():
        return sessions_data
    try:
        files = sorted(
            [f for f in sess_dir.glob('*.jsonl')
             if not f.name.endswith('.trajectory.jsonl')
             and '.trajectory-path' not in f.name],
            key=lambda f: f.stat().st_mtime
        )
    except Exception:
        return sessions_data
    for sf in files:
        msgs = []
        try:
            for line in sf.read_text(errors='replace').strip().splitlines():
                try:
                    m = json.loads(line)
                    if m.get('role') in ('user', 'assistant', 'system'):
                        msgs.append(m)
                except Exception:
                    pass
        except Exception:
            pass
        if not msgs:
            continue
        ts_list = [get_ts(m) for m in msgs if get_ts(m)]
        first_ts = ts_list[0] if ts_list else ''
        last_ts  = ts_list[-1] if ts_list else ''
        first_user = next((m for m in msgs if m.get('role') == 'user'), None)
        task = ''
        if first_user:
            c = first_user.get('content', '')
            if isinstance(c, list):
                c = ' '.join(p.get('text', '') for p in c if isinstance(p, dict))
            task = str(c)[:250]
        try:
            mtime = sf.stat().st_mtime
        except Exception:
            mtime = 0
        sessions_data.append({
            'id': sf.stem,
            'mtime': mtime,
            'msg_count': len(msgs),
            'first_ts': first_ts,
            'last_ts': last_ts,
            'task': task,
        })
    sessions_data.sort(key=lambda s: s['mtime'], reverse=True)
    return sessions_data

def scan_agent_dir(d):
    sessions_data = parse_sessions(d)
    soul = d / 'SOUL.md'
    parent_id = None
    description = ''
    if soul.exists():
        try:
            for line in soul.read_text(errors='replace').splitlines():
                ll = line.strip().lower()
                if not parent_id and any(ll.startswith(p) for p in ('parent_agent:', 'spawned_by:', 'parent:')):
                    parent_id = line.split(':', 1)[1].strip() if ':' in line else ''
                if not description and ll.startswith('description:'):
                    description = line.split(':', 1)[1].strip() if ':' in line else ''
        except Exception:
            pass
    now = datetime.now(timezone.utc).timestamp()
    last_mtime = sessions_data[0]['mtime'] if sessions_data else 0
    is_active = bool(sessions_data) and (now - last_mtime) < 1800
    return {
        'id': d.name,
        'is_active': is_active,
        'parent_id': parent_id or None,
        'description': description,
        'session_count': len(sessions_data),
        'sessions': sessions_data[:6],
        'created_at': sessions_data[-1]['first_ts'] if sessions_data else '',
        'last_active': sessions_data[0]['last_ts'] if sessions_data else '',
        'last_task': sessions_data[0]['task'] if sessions_data else '',
        'name': '',
        'role': '',
    }

try:
    wp = Path('${wp}')
    results = []
    seen = set()

    agents_dir = wp / 'agents'
    if agents_dir.exists():
        for d in sorted(agents_dir.iterdir()):
            if not d.is_dir(): continue
            if d.name.startswith('.') or d.name in ('node_modules', '__pycache__', 'evolution'): continue
            entry = scan_agent_dir(d)
            results.append(entry)
            seen.add(d.name)

    tasks_dir = wp / 'tasks'
    if tasks_dir.exists():
        for d in sorted(tasks_dir.iterdir()):
            if d.is_dir() and d.name not in seen:
                results.append({
                    'id': d.name, 'is_active': False, 'parent_id': None,
                    'description': 'task', 'session_count': 0, 'sessions': [],
                    'created_at': '', 'last_active': '', 'last_task': '',
                    'name': d.name.replace('-', ' ').title(), 'role': 'task',
                })

    subagents_file = wp / 'subagents' / 'runs.json'
    if subagents_file.exists():
        try:
            runs_data = json.loads(subagents_file.read_text(errors='replace'))
            runs = runs_data.get('runs', {})
            now_sec = datetime.now(timezone.utc).timestamp()
            for run_id, run in runs.items():
                if run_id in seen:
                    continue
                ctrl_key = run.get('controllerSessionKey', '')
                parts = ctrl_key.split(':')
                parent_id = parts[1] if len(parts) >= 2 else None
                created_ms = run.get('createdAt') or run.get('startedAt') or 0
                ended_ms = run.get('endedAt') or 0
                def ms_to_iso(ms):
                    if not ms: return ''
                    try: return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
                    except: return ''
                created_at = ms_to_iso(created_ms)
                ended_at   = ms_to_iso(ended_ms)
                is_active = (not ended_ms) or (now_sec - ended_ms / 1000) < 1800
                label = run.get('label', '')
                task  = run.get('task', '')
                if label:
                    name = label
                elif task:
                    first_line = task.split('\\n')[0].strip()
                    name = first_line[:50] if first_line else run_id[:8]
                else:
                    name = run_id[:8]
                virtual_mtime = (ended_ms or created_ms) / 1000
                virtual_sess = {
                    'id': run_id,
                    'mtime': virtual_mtime,
                    'msg_count': 0,
                    'first_ts': created_at,
                    'last_ts': ended_at or created_at,
                    'task': task[:250],
                }
                results.append({
                    'id': run_id,
                    'is_active': is_active,
                    'parent_id': parent_id,
                    'description': 'subagent run',
                    'session_count': 1,
                    'sessions': [virtual_sess],
                    'created_at': created_at,
                    'last_active': ended_at or created_at,
                    'last_task': task[:250],
                    'name': name,
                    'role': 'subagent',
                })
                seen.add(run_id)
        except Exception as e:
            pass

    cfg_file = wp / 'openclaw.json'
    if cfg_file.exists():
        try:
            cfg = json.loads(cfg_file.read_text(errors='replace'))
            raw = cfg.get('agents', {})
            agent_defs = {}
            if isinstance(raw, list):
                for a in raw:
                    if a.get('id'): agent_defs[a['id']] = a
            elif isinstance(raw, dict):
                for k, v in raw.items():
                    agent_defs[k] = {'id': k, **(v if isinstance(v, dict) else {})}
            for r in results:
                defn = agent_defs.get(r['id'], {})
                if not r['name']: r['name'] = defn.get('name') or r['id'].replace('-', ' ').title()
                if not r['role']: r['role'] = defn.get('role') or ''
        except Exception:
            for r in results:
                if not r['name']: r['name'] = r['id'].replace('-', ' ').title()

    print(json.dumps(results, default=str))
except Exception as e:
    print(json.dumps([]))
    print('ERR: ' + str(e), file=__import__('sys').stderr)
PYEOF`
}

// ─── Tool Inventory (unchanged) ───────────────────────────────────────────────

function ToolInventory({ instance }: { instance: OpenClawInstance }) {
  const [tools, setTools] = useState<ToolConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const raw = await sshExec(instance.id, `python3 - <<'PYEOF'
import json
from pathlib import Path
wp = '${instance.workspacePath}'
cfg = json.loads(Path(wp+'/openclaw.json').read_text(errors='replace'))
t = cfg.get('tools', {})
print(json.dumps({
  'safeBins': t.get('exec', {}).get('safeBins', []),
  'trustedDirs': t.get('exec', {}).get('safeBinTrustedDirs', []),
  'fsWorkspaceOnly': t.get('fs', {}).get('workspaceOnly', False),
  'execAsk': t.get('exec', {}).get('ask', 'unknown'),
  'execSecurity': t.get('exec', {}).get('security', 'unknown'),
  'byProvider': t.get('byProvider', {}),
  'skills': {k: {'enabled': v.get('enabled', False)} for k,v in cfg.get('skills',{}).get('entries',{}).items()},
}))
PYEOF`)
        const parsed = JSON.parse(raw.trim())
        setTools(parsed)
      } catch { /* empty state */ } finally { setLoading(false) }
    }
    load()
  }, [instance.id, instance.workspacePath])

  if (loading) return <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
  if (!tools) return <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)' }}>Failed to load tool inventory</div>

  const enabled = Object.entries(tools.skills).filter(([, v]) => v.enabled)
  const disabled = Object.entries(tools.skills).filter(([, v]) => !v.enabled)

  const Sect = ({ title, icon }: { title: string; icon: React.ReactNode }) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 22 }}>{icon} {title}</div>
  )

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <Sect title="Exec Policy" icon={<Shield size={12} />} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Security', value: tools.execSecurity, good: tools.execSecurity === 'full' },
          { label: 'Ask mode', value: tools.execAsk, good: tools.execAsk !== 'off' },
          { label: 'FS access', value: tools.fsWorkspaceOnly ? 'workspace only' : 'unrestricted', good: tools.fsWorkspaceOnly },
        ].map(s => (
          <div key={s.label} style={{ background: s.good ? 'rgba(34,197,94,0.07)' : 'rgba(245,158,11,0.07)', border: `1px solid ${s.good ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: s.good ? 'var(--success)' : 'var(--warning)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <Sect title="Safe Bins" icon={<Wrench size={12} />} />
      {tools.safeBins.length === 0
        ? <span style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>None configured</span>
        : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tools.safeBins.map(b => <span key={b} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: 'var(--success)', fontFamily: 'monospace' }}>{b}</span>)}
        </div>
      }

      {Object.keys(tools.byProvider).length > 0 && (
        <>
          <Sect title="Channel Restrictions" icon={<Shield size={12} />} />
          {Object.entries(tools.byProvider).map(([p, rules]) => {
            const r = rules as { deny?: string[] }
            return (
              <div key={p} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{p}</div>
                {r.deny?.length ? <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{r.deny.map(d => <span key={d} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: 'var(--error)' }}>{d}</span>)}</div> : null}
              </div>
            )
          })}
        </>
      )}

      <Sect title={`Skills (${enabled.length} enabled / ${disabled.length} disabled)`} icon={<Zap size={12} />} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {enabled.map(([n]) => <span key={n} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={9} /> {n}</span>)}
      </div>
      {disabled.length > 0 && (
        <details>
          <summary style={{ fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer', userSelect: 'none' }}>{disabled.length} disabled</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {disabled.map(([n]) => <span key={n} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, background: 'var(--surface3)', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={9} /> {n}</span>)}
          </div>
        </details>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTs(iso: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const diff = Date.now() - d.getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const dy = Math.floor(h / 24)
    if (dy < 30) return `${dy}d ago`
    return d.toLocaleDateString()
  } catch { return iso }
}

function durStr(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return ''
  try {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
    if (ms <= 0) return ''
    const m = Math.floor(ms / 60000)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ${m % 60}m`
    return `${Math.floor(h / 24)}d ${h % 24}h`
  } catch { return '' }
}

// Activity bar: last 14 days, one cell per day. Filled = had sessions.
function ActivityBar({ sessions }: { sessions: SessionSnap[] }) {
  const DAYS = 14
  const now = Date.now()
  const dayMs = 86400000
  const buckets = Array.from({ length: DAYS }, (_, i) => {
    const dayStart = now - (DAYS - 1 - i) * dayMs
    const dayEnd = dayStart + dayMs
    const active = sessions.some(s => {
      const mt = s.mtime * 1000
      return mt >= dayStart && mt < dayEnd
    })
    return { active, i }
  })

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {buckets.map(b => (
        <div key={b.i} title={b.active ? 'Active this day' : 'No activity'} style={{
          width: 7, height: 12, borderRadius: 2, flexShrink: 0,
          background: b.active ? 'var(--accent)' : 'var(--surface3)',
          opacity: b.active ? (b.i === DAYS - 1 ? 1 : 0.65 + b.i * 0.025) : 0.3,
        }} />
      ))}
      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>14d</span>
    </div>
  )
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent, isSelected, onSelect, allAgents }: {
  agent: AgentNode
  isSelected: boolean
  onSelect: () => void
  allAgents: AgentNode[]
}) {
  const parentAgent = agent.parent_id ? allAgents.find(a => a.id === agent.parent_id) : null
  const children = allAgents.filter(a => a.parent_id === agent.id)
  const duration = durStr(agent.created_at, agent.last_active)

  return (
    <div
      onClick={onSelect}
      style={{
        background: isSelected ? 'rgba(59,130,246,0.07)' : 'var(--surface2)',
        border: `1px solid ${isSelected ? 'rgba(59,130,246,0.35)' : agent.is_active ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
        borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Row 1: name + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: agent.is_active ? 'rgba(34,197,94,0.12)' : 'var(--surface3)', border: `1px solid ${agent.is_active ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {agent.parent_id ? <GitBranch size={13} style={{ color: 'var(--text-muted)' }} /> : <Bot size={13} style={{ color: agent.is_active ? 'var(--success)' : 'var(--text-muted)' }} />}
          </div>
          {agent.is_active && (
            <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', border: '1.5px solid var(--surface2)', animation: 'pulse 2s infinite' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{agent.name}</span>
            {agent.is_active && (
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(34,197,94,0.12)', color: 'var(--success)', fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>ACTIVE</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
            {agent.role && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{agent.role}</span>}
            {parentAgent && (
              <span style={{ fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <ArrowRight size={8} /> {parentAgent.name}
              </span>
            )}
            {children.length > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{children.length} child{children.length > 1 ? 'ren' : ''}</span>
            )}
          </div>
        </div>

        <ChevronRight size={12} style={{ color: 'var(--text-dim)', flexShrink: 0, opacity: 0.5 }} />
      </div>

      {/* Row 2: last task */}
      {agent.last_task && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {agent.last_task}
        </div>
      )}

      {/* Row 3: stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 9 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <MessageSquare size={10} /> {agent.session_count} session{agent.session_count !== 1 ? 's' : ''}
        </span>
        {agent.last_active && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} /> {relTs(agent.last_active)}
          </span>
        )}
        {duration && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>· {duration}</span>
        )}
      </div>

      {/* Row 4: activity bar */}
      <ActivityBar sessions={agent.sessions} />
    </div>
  )
}

// ─── Timeline view ────────────────────────────────────────────────────────────

function TimelineView({ agents, onSelect }: { agents: AgentNode[]; onSelect: (a: AgentNode) => void }) {
  const DAYS = 14
  const now = Date.now()
  const dayMs = 86400000

  const dayLabels = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now - (DAYS - 1 - i) * dayMs)
    return i === DAYS - 1 ? 'Today' : i === DAYS - 2 ? 'Yesterday' : d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  })

  return (
    <div style={{ padding: '0 24px 24px', overflow: 'auto', flex: 1 }}>
      {/* Day header */}
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 0, position: 'sticky', top: 0, background: 'var(--surface)', paddingTop: 16, paddingBottom: 8, zIndex: 2, marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Agent</div>
        <div style={{ display: 'flex' }}>
          {dayLabels.map((label, i) => (
            <div key={i} style={{ flex: 1, fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 1px' }}>{i % 3 === 0 || i === DAYS - 1 ? label : ''}</div>
          ))}
        </div>
      </div>

      {/* Agent rows */}
      {agents.map(agent => {
        const buckets = Array.from({ length: DAYS }, (_, i) => {
          const dayStart = now - (DAYS - 1 - i) * dayMs
          const dayEnd = dayStart + dayMs
          const count = agent.sessions.filter(s => {
            const mt = s.mtime * 1000
            return mt >= dayStart && mt < dayEnd
          }).length
          return count
        })

        return (
          <div
            key={agent.id}
            onClick={() => onSelect(agent)}
            style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 0, marginBottom: 6, cursor: 'pointer', borderRadius: 8, padding: '6px 0', transition: 'background 0.1s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {/* Label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingRight: 12, minWidth: 0 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, background: agent.is_active ? 'rgba(34,197,94,0.15)' : 'var(--surface3)', border: `1px solid ${agent.is_active ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {agent.parent_id ? <GitBranch size={10} style={{ color: 'var(--text-dim)' }} /> : <Bot size={10} style={{ color: agent.is_active ? 'var(--success)' : 'var(--text-dim)' }} />}
                </div>
                {agent.is_active && <span style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', border: '1px solid var(--surface2)', animation: 'pulse 2s infinite' }} />}
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{agent.name}</span>
            </div>

            {/* Buckets */}
            <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {buckets.map((count, i) => (
                <div
                  key={i}
                  title={count > 0 ? `${count} session${count > 1 ? 's' : ''} this day` : ''}
                  style={{
                    flex: 1, height: 20, borderRadius: 3,
                    background: count > 0
                      ? (agent.is_active && i === DAYS - 1
                        ? 'var(--success)'
                        : 'var(--accent)')
                      : 'var(--surface3)',
                    opacity: count > 0 ? (0.4 + Math.min(count, 4) * 0.15) : 0.2,
                  }}
                />
              ))}
            </div>
          </div>
        )
      })}

      {agents.length === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No agents discovered</div>
      )}
    </div>
  )
}

// ─── Detail slide-in ──────────────────────────────────────────────────────────

function AgentDetail({ agent, allAgents, onClose }: { agent: AgentNode; allAgents: AgentNode[]; onClose: () => void }) {
  const parent = agent.parent_id ? allAgents.find(a => a.id === agent.parent_id) : null
  const children = allAgents.filter(a => a.parent_id === agent.id)
  const duration = durStr(agent.created_at, agent.last_active)

  return (
    <div style={{ width: 360, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: agent.is_active ? 'rgba(34,197,94,0.12)' : 'var(--surface2)', border: `1px solid ${agent.is_active ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {agent.parent_id ? <GitBranch size={15} style={{ color: 'var(--text-muted)' }} /> : <Bot size={15} style={{ color: agent.is_active ? 'var(--success)' : 'var(--text-muted)' }} />}
          </div>
          {agent.is_active && <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', border: '1.5px solid var(--surface)', animation: 'pulse 2s infinite' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 1 }}>{agent.id}</div>
        </div>
        <button onClick={onClose} style={{ padding: '5px 7px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={13} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
        {/* Status + lifespan */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Status', value: agent.is_active ? 'Active' : 'Idle', color: agent.is_active ? 'var(--success)' : 'var(--text-muted)' },
            { label: 'Sessions', value: String(agent.session_count), color: 'var(--text)' },
            { label: 'First seen', value: agent.created_at ? relTs(agent.created_at) : '—', color: 'var(--text-muted)' },
            { label: 'Last active', value: agent.last_active ? relTs(agent.last_active) : '—', color: 'var(--text-muted)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {duration && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={11} /> Total lifespan: <strong>{duration}</strong>
          </div>
        )}

        {/* Activity */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Activity (14 days)</div>
          <ActivityBar sessions={agent.sessions} />
        </div>

        {/* Hierarchy */}
        {(parent || children.length > 0) && (
          <div style={{ marginBottom: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 13px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Hierarchy</div>
            {parent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>
                <ArrowRight size={10} style={{ color: 'var(--accent)' }} />
                <span style={{ color: 'var(--text-dim)' }}>Spawned by:</span>
                <strong style={{ color: 'var(--accent)' }}>{parent.name}</strong>
              </div>
            )}
            {children.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>
                <GitBranch size={10} style={{ color: 'var(--text-dim)' }} />
                <span style={{ color: 'var(--text-dim)' }}>Subagent:</span>
                <strong style={{ color: 'var(--text)' }}>{c.name}</strong>
                {c.is_active && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', color: 'var(--success)', fontWeight: 700 }}>ACTIVE</span>}
              </div>
            ))}
          </div>
        )}

        {/* Role / description */}
        {(agent.role || agent.description) && (
          <div style={{ marginBottom: 16 }}>
            {agent.role && <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border)', marginBottom: 8 }}>{agent.role}</div>}
            {agent.description && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>{agent.description}</p>}
          </div>
        )}

        {/* Recent sessions */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Recent Sessions</div>
        {agent.sessions.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No sessions found</div>
          : agent.sessions.map((s, i) => (
            <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 13px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: s.task ? 6 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 && agent.is_active ? 'var(--success)' : 'var(--accent)', opacity: 0.7, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{s.id}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span>{s.msg_count} msg</span>
                  {s.last_ts && <span>{relTs(s.last_ts)}</span>}
                </div>
              </div>
              {s.task && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {s.task}
                </p>
              )}
              {s.first_ts && s.last_ts && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 5 }}>
                  {durStr(s.first_ts, s.last_ts) || 'instant'} · {new Date(s.first_ts).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AgentsView({ instance }: { instance: OpenClawInstance }) {
  const [agents, setAgents] = useState<AgentNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AgentNode | null>(null)
  const [tab, setTab] = useState<'agents' | 'timeline' | 'tools'>('agents')
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const raw = await sshExec(instance.id, buildDiscoveryScript(instance.workspacePath))
      const trimmed = raw.trim()
      if (!trimmed) { setAgents([]); return }
      const parsed: AgentNode[] = JSON.parse(trimmed)
      // Sort: active first, then by last_active desc
      parsed.sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
        const ta = a.last_active ? new Date(a.last_active).getTime() : 0
        const tb = b.last_active ? new Date(b.last_active).getTime() : 0
        return tb - ta
      })
      setAgents(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }, [instance.id, instance.workspacePath])

  useEffect(() => { load() }, [load])

  const active = agents.filter(a => a.is_active)
  const subagents = agents.filter(a => a.parent_id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)', padding: '0 16px', gap: 4 }}>
        {[
          { key: 'agents' as const, label: 'Fleet' },
          { key: 'timeline' as const, label: 'Timeline' },
          { key: 'tools' as const, label: 'Tool Inventory' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 14px', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Stats chips */}
        {active.length > 0 && (
          <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, marginRight: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite', display: 'inline-block' }} />
            {active.length} active
          </span>
        )}
        {subagents.length > 0 && (
          <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', marginRight: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <GitBranch size={9} /> {subagents.length} subagent{subagents.length > 1 ? 's' : ''}
          </span>
        )}

        <button onClick={load} disabled={loading} style={{ padding: '6px 8px', background: 'transparent', border: 'none', borderRadius: 7, color: 'var(--text-muted)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Tool Inventory */}
      {tab === 'tools' && <ToolInventory instance={instance} />}

      {/* Timeline */}
      {tab === 'timeline' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {loading
              ? <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)' }}>Loading agents…</div>
              : error
                ? <div style={{ padding: 24, fontSize: 13, color: 'var(--error)' }}>{error}</div>
                : <TimelineView agents={agents} onSelect={a => setSelected(a === selected ? null : a)} />
            }
          </div>
          {selected && (
            <AgentDetail agent={selected} allAgents={agents} onClose={() => setSelected(null)} />
          )}
        </div>
      )}

      {/* Fleet (cards / list) */}
      {tab === 'agents' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            {/* Sub-header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {loading ? 'Scanning agents…' : error ? <span style={{ color: 'var(--error)' }}>{error}</span> : `${agents.length} agent${agents.length !== 1 ? 's' : ''} found`}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setViewMode('cards')} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: viewMode === 'cards' ? 'var(--accent-dim)' : 'var(--surface2)', color: viewMode === 'cards' ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer' }}>
                  <LayoutGrid size={12} />
                </button>
                <button onClick={() => setViewMode('list')} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: viewMode === 'list' ? 'var(--accent-dim)' : 'var(--surface2)', color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer' }}>
                  <Activity size={12} />
                </button>
              </div>
            </div>

            {!loading && !error && agents.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <Zap size={36} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.2 }} />
                <p style={{ fontSize: 14, margin: '0 0 6px', color: 'var(--text)' }}>No agents found</p>
                <p style={{ fontSize: 12, margin: 0 }}>Scanned {instance.workspacePath}/agents/, tasks/, and subagents/runs.json</p>
              </div>
            )}

            <div style={viewMode === 'cards'
              ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }
              : { display: 'flex', flexDirection: 'column', gap: 8 }
            }>
              {agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selected?.id === agent.id}
                  onSelect={() => setSelected(selected?.id === agent.id ? null : agent)}
                  allAgents={agents}
                />
              ))}
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <AgentDetail agent={selected} allAgents={agents} onClose={() => setSelected(null)} />
          )}
        </div>
      )}
    </div>
  )
}
