'use client'
import { sshExec } from '@/lib/utils'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, X, Plus, Edit2, Trash2, Package, Zap, CheckCircle, XCircle, ChevronRight, FileText, Terminal } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plugin {
  id: string
  name: string
  description: string
  enabled: boolean
  origin: string
  tags: string[]
  version?: string
}

interface CustomSkill {
  name: string
  dirName: string
  description: string
  userInvocable: boolean
  content: string
}

interface Script {
  name: string
  path: string
  size: number
}

type Tab = 'plugins' | 'skills' | 'scripts'


// ─── Skill editor modal ───────────────────────────────────────────────────────

function SkillEditor({
  skill, onSave, onClose, saving,
}: {
  skill: Partial<CustomSkill> & { isNew: boolean }
  onSave: (s: { dirName: string; name: string; description: string; userInvocable: boolean; content: string }) => void
  onClose: () => void
  saving: boolean
}) {
  const [dirName, setDirName] = useState(skill.dirName ?? '')
  const [name, setName] = useState(skill.name ?? '')
  const [description, setDescription] = useState(skill.description ?? '')
  const [userInvocable, setUserInvocable] = useState(skill.userInvocable ?? false)
  const [content, setContent] = useState(skill.content ?? `# ${skill.name ?? 'My Skill'}\n\nDescribe when and how to use this skill.\n\n## Instructions\n\n1. Step one\n2. Step two\n`)

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4,
    display: 'block', textTransform: 'uppercase', letterSpacing: '0.07em',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{skill.isNew ? 'New Custom Skill' : `Edit: ${skill.name}`}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={16} /></button>
        </div>

        <div style={{ padding: 20, flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Skill Name</label>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Browser Automation" />
            </div>
            <div>
              <label style={labelStyle}>Directory Name</label>
              <input style={inputStyle} value={dirName} onChange={e => setDirName(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))} placeholder="browser-automation" spellCheck={false} disabled={!skill.isNew} />
              {skill.isNew && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>Letters, numbers, hyphens only</div>}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <input style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of when to use this skill" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="ui-cb" checked={userInvocable} onChange={e => setUserInvocable(e.target.checked)} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }} />
            <label htmlFor="ui-cb" style={{ fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>User-invocable (appears in skill menu)</label>
          </div>

          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Skill Content (Markdown)</label>
            <textarea
              value={content} onChange={e => setContent(e.target.value)}
              style={{ ...inputStyle, minHeight: 220, resize: 'vertical', lineHeight: 1.6, fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 12 }}
              placeholder="# Skill Name&#10;&#10;Describe when and how to use this skill..."
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={() => onSave({ dirName, name, description, userInvocable, content })}
            disabled={saving || !name || !dirName}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Skill'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Plugin card ──────────────────────────────────────────────────────────────

function PluginCard({ plugin, onToggle, toggling }: { plugin: Plugin; onToggle: () => void; toggling: boolean }) {
  const [hover, setHover] = useState(false)

  const originColor = plugin.origin === 'npm' ? 'var(--warning)' : 'var(--text-dim)'
  const originBg = plugin.origin === 'npm' ? 'rgba(245,158,11,0.1)' : 'var(--surface3)'

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '12px 14px', borderRadius: 10,
        background: hover ? 'var(--surface3)' : 'var(--surface2)',
        border: `1px solid ${plugin.enabled ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
        transition: 'all 0.15s', display: 'flex', alignItems: 'flex-start', gap: 12,
      }}
    >
      {/* Status dot */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: plugin.enabled ? 'var(--success)' : 'var(--text-dim)', flexShrink: 0, marginTop: 5 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{plugin.name || plugin.id}</span>
          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: originBg, color: originColor, flexShrink: 0 }}>
            {plugin.origin}
          </span>
          {plugin.version && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>v{plugin.version}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {plugin.description || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>No description</span>}
        </div>
        {plugin.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {plugin.tags.slice(0, 4).map(t => (
              <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--accent-dim)', color: 'var(--accent)' }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onToggle}
        disabled={toggling}
        title={plugin.enabled ? 'Disable plugin' : 'Enable plugin'}
        style={{
          flexShrink: 0, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
          border: `1px solid ${plugin.enabled ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          background: 'transparent',
          color: plugin.enabled ? 'var(--error)' : 'var(--success)',
          cursor: toggling ? 'not-allowed' : 'pointer',
          opacity: toggling ? 0.5 : 1,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {plugin.enabled
          ? <><XCircle size={11} /> Disable</>
          : <><CheckCircle size={11} /> Enable</>
        }
      </button>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function SkillsManager({ instance }: { instance: OpenClawInstance }) {
  const [tab, setTab] = useState<Tab>('plugins')
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [skills, setSkills] = useState<CustomSkill[]>([])
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [toggling, setToggling] = useState<string | null>(null)
  const [editingSkill, setEditingSkill] = useState<(Partial<CustomSkill> & { isNew: boolean }) | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedScript, setSelectedScript] = useState<string | null>(null)
  const [scriptContent, setScriptContent] = useState<string>('')
  const [scriptLoading, setScriptLoading] = useState(false)

  const wp = instance.workspacePath
  const skillsDir = `${wp}/plugin-skills`
  const scriptsDir = `${wp}/scripts`

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [pluginRaw, skillsRaw, scriptsRaw] = await Promise.all([
        // Batch-read all plugin manifests in one Python call
        sshExec(instance.id, `python3 << 'PYEOF'
import json, os
d = json.load(open('/home/openclaw/.openclaw/plugins/installs.json'))
result = []
for p in d.get('plugins', []):
    mp = p.get('manifestPath', '')
    manifest = {}
    if mp and os.path.exists(mp):
        try: manifest = json.load(open(mp))
        except: pass
    result.append({
        'id': p.get('pluginId', ''),
        'enabled': p.get('enabled', False),
        'origin': p.get('origin', 'bundled'),
        'version': p.get('version', ''),
        'name': manifest.get('name', p.get('pluginId', '')),
        'description': manifest.get('description', '')[:200],
        'tags': manifest.get('tags', []),
    })
print(json.dumps(result))
PYEOF`),
        // List custom skills
        sshExec(instance.id, `python3 << 'PYEOF'
import os, json
base = '${skillsDir}'
result = []
if os.path.isdir(base):
    for d in sorted(os.listdir(base)):
        skill_file = os.path.join(base, d, 'SKILL.md')
        if os.path.isfile(skill_file):
            content = open(skill_file).read()
            # Parse frontmatter
            name, description, user_invocable = d, '', False
            lines = content.split('\\n')
            if lines[0].strip() == '---':
                for i, line in enumerate(lines[1:], 1):
                    if line.strip() == '---': break
                    if line.startswith('name:'): name = line.split(':', 1)[1].strip()
                    elif line.startswith('description:'): description = line.split(':', 1)[1].strip()
                    elif line.startswith('user-invocable:'): user_invocable = 'true' in line.lower()
            result.append({'dirName': d, 'name': name, 'description': description, 'userInvocable': user_invocable, 'content': content})
print(json.dumps(result))
PYEOF`),
        // List scripts
        sshExec(instance.id, `python3 << 'PYEOF'
import os, json
base = '${scriptsDir}'
result = []
if os.path.isdir(base):
    for f in sorted(os.listdir(base)):
        fp = os.path.join(base, f)
        if os.path.isfile(fp):
            result.append({'name': f, 'path': fp, 'size': os.path.getsize(fp)})
print(json.dumps(result))
PYEOF`),
      ])

      try { setPlugins(JSON.parse(pluginRaw.trim() || '[]')) } catch { setPlugins([]) }
      try { setSkills(JSON.parse(skillsRaw.trim() || '[]')) } catch { setSkills([]) }
      try { setScripts(JSON.parse(scriptsRaw.trim() || '[]')) } catch { setScripts([]) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [instance.id, skillsDir, scriptsDir])

  useEffect(() => { load().catch(() => {}) }, [load])

  async function togglePlugin(plugin: Plugin) {
    setToggling(plugin.id)
    try {
      const cmd = plugin.enabled ? 'disable' : 'enable'
      await sshExec(instance.id, `openclaw plugins ${cmd} ${plugin.id} 2>&1 || echo "done"`)
      setPlugins(prev => prev.map(p => p.id === plugin.id ? { ...p, enabled: !p.enabled } : p))
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setToggling(null)
    }
  }

  async function saveSkill(data: { dirName: string; name: string; description: string; userInvocable: boolean; content: string }) {
    setSaving(true)
    try {
      const { dirName, name, description, userInvocable, content } = data
      // Build the SKILL.md with frontmatter
      const frontmatter = `---\nname: ${name}\ndescription: ${description}\nuser-invocable: ${userInvocable}\n---\n\n`
      // Strip existing frontmatter from content if present
      let body = content
      if (body.startsWith('---')) {
        const end = body.indexOf('---', 3)
        if (end >= 0) body = body.slice(end + 3).trimStart()
      }
      const fullContent = frontmatter + body

      // Base64 encode to avoid shell escaping
      const b64 = btoa(unescape(encodeURIComponent(fullContent)))
      await sshExec(instance.id, `python3 -c "
import base64, os
os.makedirs('${skillsDir}/${dirName}', exist_ok=True)
content = base64.b64decode('${b64}').decode()
open('${skillsDir}/${dirName}/SKILL.md', 'w').write(content)
print('ok')
"`)
      setEditingSkill(null)
      await load()
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSkill(dirName: string) {
    if (!confirm(`Delete skill "${dirName}"?`)) return
    try {
      await sshExec(instance.id, `rm -rf "${skillsDir}/${dirName}"`)
      setSkills(prev => prev.filter(s => s.dirName !== dirName))
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function loadScript(path: string) {
    setSelectedScript(path)
    setScriptLoading(true)
    try {
      const out = await sshExec(instance.id, `cat "${path}"`)
      setScriptContent(out)
    } catch {
      setScriptContent('Failed to load script')
    } finally {
      setScriptLoading(false)
    }
  }

  // Filter plugins
  const filteredPlugins = plugins.filter(p => {
    const matchSearch = !search || p.id.toLowerCase().includes(search.toLowerCase()) || (p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase())
    const matchFilter = filterEnabled === 'all' || (filterEnabled === 'enabled' ? p.enabled : !p.enabled)
    return matchSearch && matchFilter
  })

  const filteredSkills = skills.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase())
  )

  const enabledCount = plugins.filter(p => p.enabled).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Skills &amp; Plugins</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, margin: 0 }}>
            {instance.name} · {plugins.length} plugins ({enabledCount} enabled) · {skills.length} custom skill{skills.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tab === 'skills' && (
            <button onClick={() => setEditingSkill({ isNew: true })} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={12} /> New Skill
            </button>
          )}
          <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Tab bar + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {([
            { key: 'plugins', icon: Package, label: `Plugins (${plugins.length})` },
            { key: 'skills', icon: Zap, label: `Custom Skills (${skills.length})` },
            { key: 'scripts', icon: Terminal, label: `Scripts (${scripts.length})` },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => { setTab(key); setSearch('') }} style={{ padding: '5px 14px', fontSize: 12, border: 'none', cursor: 'pointer', background: tab === key ? 'var(--accent-dim)' : 'transparent', color: tab === key ? 'var(--accent)' : 'var(--text-muted)', fontWeight: tab === key ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>

        {/* Search */}
        {(tab === 'plugins' || tab === 'skills') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', flex: 1, maxWidth: 260 }}>
            <Search size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === 'plugins' ? 'Search plugins…' : 'Search skills…'}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, width: '100%', color: 'var(--text)', padding: 0 }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0 }}><X size={11} /></button>}
          </div>
        )}

        {/* Plugin filter */}
        {tab === 'plugins' && (
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 7, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {(['all', 'enabled', 'disabled'] as const).map(f => (
              <button key={f} onClick={() => setFilterEnabled(f)} style={{ padding: '4px 10px', fontSize: 11, border: 'none', cursor: 'pointer', background: filterEnabled === f ? 'var(--accent-dim)' : 'transparent', color: filterEnabled === f ? 'var(--accent)' : 'var(--text-muted)', fontWeight: filterEnabled === f ? 600 : 400 }}>{f}</button>
            ))}
          </div>
        )}
      </div>

      {error && <div style={{ padding: '8px 18px', fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', flexShrink: 0 }}>{error}</div>}

      {/* ── Plugins tab ── */}
      {tab === 'plugins' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
          {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading plugins…</div>}

          {!loading && filteredPlugins.length === 0 && (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
              <Package size={32} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.2 }} />
              <p style={{ fontSize: 14, margin: 0 }}>No plugins match your filter</p>
            </div>
          )}

          {/* Stats bar */}
          {!loading && filteredPlugins.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>{filteredPlugins.length} shown</span>
              <span style={{ color: 'var(--success)' }}>{filteredPlugins.filter(p => p.enabled).length} enabled</span>
              <span style={{ color: 'var(--text-dim)' }}>{filteredPlugins.filter(p => !p.enabled).length} disabled</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
            {filteredPlugins.map(plugin => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onToggle={() => togglePlugin(plugin)}
                toggling={toggling === plugin.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Custom Skills tab ── */}
      {tab === 'skills' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
          {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading skills…</div>}

          {!loading && filteredSkills.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
              <Zap size={32} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.2 }} />
              <p style={{ fontSize: 14, margin: '0 0 8px' }}>No custom skills yet</p>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 14px' }}>
                Custom skills are markdown guides stored in <code>plugin-skills/</code>
              </p>
              <button onClick={() => setEditingSkill({ isNew: true })} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                Create your first skill
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredSkills.map(skill => (
              <div key={skill.dirName} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-dim)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Zap size={16} style={{ color: 'var(--accent)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{skill.name}</span>
                    {skill.userInvocable && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--success)', color: '#000', fontWeight: 600 }}>user-invocable</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>{skill.description || <em style={{ color: 'var(--text-dim)' }}>No description</em>}</div>
                  <code style={{ fontSize: 10, color: 'var(--text-dim)' }}>plugin-skills/{skill.dirName}/SKILL.md</code>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setEditingSkill({ ...skill, isNew: false })} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                    <Edit2 size={11} /> Edit
                  </button>
                  <button onClick={() => deleteSkill(skill.dirName)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: 'var(--error)', fontSize: 11, cursor: 'pointer' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Scripts tab ── */}
      {tab === 'scripts' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Script list */}
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto', background: 'var(--surface)' }}>
            <div style={{ padding: '10px 12px 4px', fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scripts</div>
            {loading && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && scripts.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>No scripts found</div>
            )}
            {scripts.map(s => (
              <button key={s.path} onClick={() => loadScript(s.path)} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '9px 12px', textAlign: 'left', fontSize: 12,
                background: selectedScript === s.path ? 'var(--accent-dim)' : 'transparent',
                color: selectedScript === s.path ? 'var(--accent)' : 'var(--text-muted)',
                border: 'none', cursor: 'pointer',
              }}>
                <FileText size={12} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{(s.size / 1024).toFixed(1)}KB</div>
                </div>
                {selectedScript === s.path && <ChevronRight size={11} style={{ flexShrink: 0 }} />}
              </button>
            ))}
          </div>

          {/* Script viewer */}
          <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
            {!selectedScript && (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text-muted)' }}>
                <Terminal size={32} style={{ opacity: 0.2 }} />
                <p style={{ fontSize: 14 }}>Select a script to view</p>
              </div>
            )}
            {selectedScript && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedScript}</code>
                </div>
                {scriptLoading
                  ? <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
                  : (
                    <pre style={{ margin: 0, padding: 16, fontSize: 12, lineHeight: 1.7, fontFamily: "'SF Mono','Fira Code',monospace", color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {scriptContent}
                    </pre>
                  )
                }
              </>
            )}
          </div>
        </div>
      )}

      {/* Skill editor modal */}
      {editingSkill && (
        <SkillEditor
          skill={editingSkill}
          onSave={saveSkill}
          onClose={() => setEditingSkill(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
