'use client'
import { useState, useRef } from 'react'
import {
  Brain, X, CheckCircle, Sparkles, Database, BookOpen, Cpu, Zap,
  ArrowRight, Copy, Check, RefreshCw, Bot, Loader2
} from 'lucide-react'
import type { OpenClawInstance } from '@/types'

// ─── Setup prompt ─────────────────────────────────────────────────────────────
// Sent to the agent's chat API. The agent spawns a subagent (or uses its own
// terminal tool) to perform the installation, streaming back progress.

function buildSetupPrompt(wp: string): string {
  return `You are about to set up your own Self Evolution framework — a persistent learning system that lets you accumulate skills, memory, and searchable session history across all conversations.

**Please spawn a subagent** (or complete this yourself) with the following task. The subagent should use the terminal/bash tool to execute each step and report success or failure.

---

## Task: Install the Hermes Evolution Architecture

### Step 1 — Create directory structure
\`\`\`bash
mkdir -p ~/.openclaw/evolution
mkdir -p ~/.openclaw/skills/general
mkdir -p ~/.openclaw/skills/coding
mkdir -p ~/.openclaw/skills/devops
mkdir -p ~/.openclaw/skills/evolution/skill_manage
mkdir -p ~/.openclaw/skills/evolution/memory_tool
mkdir -p ~/.openclaw/skills/evolution/session_search
\`\`\`

### Step 2 — Install the evolution engine
Write the following Python script to \`~/.openclaw/evolution/evolution_tools.py\`:

\`\`\`python
#!/usr/bin/env python3
"""OpenClaw Evolution Engine — skill/memory/session/curator CLI"""
import sys, json, os, sqlite3, glob
from pathlib import Path
from datetime import datetime, timedelta

EVOLUTION_DIR = Path.home() / ".openclaw" / "evolution"
SKILLS_DIR    = Path.home() / ".openclaw" / "skills"
DB_PATH       = EVOLUTION_DIR / "sessions.db"
MEMORY_PATH   = EVOLUTION_DIR / "memory.json"
USAGE_PATH    = SKILLS_DIR / ".usage.json"

EVOLUTION_DIR.mkdir(parents=True, exist_ok=True)
SKILLS_DIR.mkdir(parents=True, exist_ok=True)

def _db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, created_at TEXT)")
    try:
        conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(session_id, role, content, tokenize='porter unicode61')")
    except Exception:
        conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(session_id, role, content)")
    conn.commit()
    return conn

def _load_memory():
    if MEMORY_PATH.exists():
        return json.loads(MEMORY_PATH.read_text())
    return {"user": [], "memory": []}

def _save_memory(data):
    MEMORY_PATH.write_text(json.dumps(data, indent=2))

def _load_usage():
    return json.loads(USAGE_PATH.read_text()) if USAGE_PATH.exists() else {}

def _save_usage(data):
    USAGE_PATH.write_text(json.dumps(data, indent=2))

def _list_skills():
    skills = []
    for f in glob.glob(str(SKILLS_DIR / "**" / "SKILL.md"), recursive=True):
        text = open(f).read()
        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) == 3:
                meta = {}
                for line in parts[1].strip().splitlines():
                    if ":" in line:
                        k, v = line.split(":", 1)
                        meta[k.strip()] = v.strip().strip('"')
                skills.append({"name": meta.get("name", Path(f).parent.name),
                               "description": meta.get("description", ""),
                               "path": f, "body": parts[2].strip()})
    return skills

def skill_list():
    usage = _load_usage()
    print(json.dumps([{**s, "use_count": usage.get(s["name"], {}).get("use_count", 0)} for s in _list_skills()], indent=2))

def skill_view(name):
    for s in _list_skills():
        if s["name"] == name:
            usage = _load_usage()
            u = usage.get(name, {})
            u["use_count"] = u.get("use_count", 0) + 1
            u["last_activity_at"] = datetime.utcnow().isoformat()
            usage[name] = u; _save_usage(usage)
            print(s["body"]); return
    print(f"Skill '{name}' not found", file=sys.stderr); sys.exit(1)

def skill_create(name, description, content, category="general"):
    d = SKILLS_DIR / category / name
    d.mkdir(parents=True, exist_ok=True)
    (d / "SKILL.md").write_text(f'---\\nname: {name}\\ndescription: "{description}"\\nversion: 1.0.0\\n---\\n\\n{content}\\n')
    usage = _load_usage()
    usage[name] = {"use_count": 0, "patch_count": 0, "last_activity_at": datetime.utcnow().isoformat(), "pinned": False}
    _save_usage(usage)
    print(json.dumps({"ok": True, "path": str(d / "SKILL.md")}))

def skill_patch(name, old_text, new_text):
    for s in _list_skills():
        if s["name"] == name:
            content = open(s["path"]).read().replace(old_text, new_text, 1)
            open(s["path"], "w").write(content)
            usage = _load_usage()
            u = usage.get(name, {})
            u["patch_count"] = u.get("patch_count", 0) + 1
            u["last_activity_at"] = datetime.utcnow().isoformat()
            usage[name] = u; _save_usage(usage)
            print(json.dumps({"ok": True})); return
    print(f"Skill '{name}' not found", file=sys.stderr); sys.exit(1)

def memory_add(store, content):
    data = _load_memory()
    if store not in data: data[store] = []
    data[store].append(content); _save_memory(data)
    print(json.dumps({"ok": True, "store": store, "count": len(data[store])}))

def memory_list(store=None):
    data = _load_memory()
    print(json.dumps(data.get(store, []) if store else data))

def memory_replace(store, old_text, new_text):
    data = _load_memory()
    if store in data:
        data[store] = [new_text if old_text in e else e for e in data[store]]
    _save_memory(data); print(json.dumps({"ok": True}))

def memory_remove(store, old_text):
    data = _load_memory()
    if store in data:
        data[store] = [e for e in data[store] if old_text not in e]
    _save_memory(data); print(json.dumps({"ok": True}))

def session_save(session_id, role, content):
    conn = _db(); now = datetime.utcnow().isoformat()
    conn.execute("INSERT INTO sessions VALUES (NULL,?,?,?,?)", (session_id, role, content, now))
    conn.execute("INSERT INTO sessions_fts VALUES (?,?,?)", (session_id, role, content))
    conn.commit(); conn.close()
    print(json.dumps({"ok": True}))

def session_search(query, limit=5):
    conn = _db()
    try:
        rows = conn.execute("""
            SELECT s.session_id, s.role,
                   snippet(sessions_fts,2,'>>','<<','...',20), s.created_at
            FROM sessions_fts f
            JOIN sessions s ON s.session_id=f.session_id AND s.content=f.content
            WHERE sessions_fts MATCH ? ORDER BY rank LIMIT ?
        """, (query, int(limit))).fetchall()
    except Exception: rows = []
    conn.close()
    print(json.dumps([{"session_id": r[0], "role": r[1], "snippet": r[2], "created_at": r[3]} for r in rows]))

def curator_status():
    usage = _load_usage(); skills = _list_skills()
    skill_names = {s["name"] for s in skills}
    cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
    stale = [n for n, u in usage.items() if n in skill_names and not u.get("pinned") and (u.get("last_activity_at") or "") < cutoff]
    print(json.dumps({"total_skills": len(skills), "stale": stale, "pinned": [n for n, u in usage.items() if u.get("pinned")]}))

CMDS = {
    "skill list": lambda a: skill_list(),
    "skill view": lambda a: skill_view(a[0]),
    "skill create": lambda a: skill_create(a[0], a[1], a[2], a[3] if len(a) > 3 else "general"),
    "skill patch": lambda a: skill_patch(a[0], a[1], a[2]),
    "memory add": lambda a: memory_add(a[0], a[1]),
    "memory list": lambda a: memory_list(a[0] if a else None),
    "memory replace": lambda a: memory_replace(a[0], a[1], a[2]),
    "memory remove": lambda a: memory_remove(a[0], a[1]),
    "session save": lambda a: session_save(a[0], a[1], a[2]),
    "session search": lambda a: session_search(a[0], int(a[1]) if len(a) > 1 else 5),
    "curator status": lambda a: curator_status(),
}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: evolution_tools.py <domain> <command> [args...]", file=sys.stderr); sys.exit(1)
    key = sys.argv[1] + " " + sys.argv[2]; args = sys.argv[3:]
    fn = CMDS.get(key)
    if not fn:
        print(f"Unknown command: {key}", file=sys.stderr); sys.exit(1)
    try: fn(args)
    except Exception as e: print(json.dumps({"error": str(e)})); sys.exit(1)
\`\`\`

### Step 3 — Create skill definition files

Write \`~/.openclaw/skills/evolution/skill_manage/SKILL.md\`:
\`\`\`markdown
---
name: skill_manage
description: Create, patch, view, or list procedural skills saved as SKILL.md files
version: 1.0.0
---

# When to Use
Use when you solve something non-trivial worth saving, find a skill needs updating, or want to review skills before a complex task.

# Commands
List: \`python3 ~/.openclaw/evolution/evolution_tools.py skill list\`
View: \`python3 ~/.openclaw/evolution/evolution_tools.py skill view "name"\`
Create: \`python3 ~/.openclaw/evolution/evolution_tools.py skill create "name" "description" "# Steps\\n1. X" "category"\`
Patch: \`python3 ~/.openclaw/evolution/evolution_tools.py skill patch "name" "old text" "new text"\`

# Rules
- Always patch first — only create if no related skill exists
- Categories: general | coding | devops | data | comms
\`\`\`

Write \`~/.openclaw/skills/evolution/memory_tool/SKILL.md\`:
\`\`\`markdown
---
name: memory_tool
description: Save and recall factual long-term memory across sessions
version: 1.0.0
---

# When to Use
Persist facts that will still matter in future sessions. Two stores: \`user\` (preferences, corrections) and \`memory\` (environment facts, tool quirks, conventions).

# Commands
Add: \`python3 ~/.openclaw/evolution/evolution_tools.py memory add "user" "fact"\`
List: \`python3 ~/.openclaw/evolution/evolution_tools.py memory list\`
Replace: \`python3 ~/.openclaw/evolution/evolution_tools.py memory replace "store" "old" "new"\`

# Rules
- Declarative facts: "User prefers X" not "Always do X"
- One fact per entry. Don't save ephemera or anything stale in 7 days.
\`\`\`

Write \`~/.openclaw/skills/evolution/session_search/SKILL.md\`:
\`\`\`markdown
---
name: session_search
description: Search past conversation sessions by topic using full-text search
version: 1.0.0
---

# When to Use
Before complex tasks — search past sessions to recall how a similar problem was solved.

# Commands
Search: \`python3 ~/.openclaw/evolution/evolution_tools.py session search "query" 5\`
Save: \`python3 ~/.openclaw/evolution/evolution_tools.py session save "session-id" "user" "content"\`
\`\`\`

### Step 4 — Initialise the session database
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py curator status
\`\`\`

### Step 5 — Write evolution instructions
Write \`~/.openclaw/evolution/EVOLUTION_INSTRUCTIONS.md\`:
\`\`\`markdown
## Evolution Tools — Active

You have three evolution tools. Use them proactively.

### skill_manage
Before complex tasks: \`python3 ~/.openclaw/evolution/evolution_tools.py skill list\`
After solving something non-trivial: save or patch a skill. Patch first, create only if nothing related exists.

### memory_tool
When you learn a persistent fact about the user or environment:
\`python3 ~/.openclaw/evolution/evolution_tools.py memory add "user|memory" "declarative fact"\`
User store: preferences, corrections, working style.
Memory store: project conventions, tool quirks, environment facts.
Do NOT save ephemera or anything stale in 7 days.

### session_search
At the start of complex tasks, search for relevant past context:
\`python3 ~/.openclaw/evolution/evolution_tools.py session search "keywords"\`

### Evolution Rules
1. Skills are patch-first — update existing, don't duplicate
2. Memory is declarative ("User prefers X") not instructional ("Always do X")
3. After every non-trivial session: consider what new skill or memory should be saved
\`\`\`

---

After completing all steps, run \`python3 ~/.openclaw/evolution/evolution_tools.py skill list\` to confirm the skills are discoverable, then report a brief summary of what was installed and any errors encountered.`
}

// ─── Four pillar cards ─────────────────────────────────────────────────────────

const PILLARS = [
  { icon: <BookOpen size={15} style={{ color: '#a78bfa' }} />, title: 'Skills', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)', desc: 'Procedural memory as SKILL.md files. Self-patching when new workflows are found.' },
  { icon: <Brain size={15} style={{ color: '#34d399' }} />, title: 'Memory', color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)', desc: 'Factual memory in two stores: user profile and environment/project facts.' },
  { icon: <Database size={15} style={{ color: '#60a5fa' }} />, title: 'Session Search', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)', desc: 'SQLite FTS5 index of every conversation — search past sessions by topic.' },
  { icon: <Zap size={15} style={{ color: '#fbbf24' }} />, title: 'Curator', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)', desc: 'Usage tracking and stale skill detection — keeps the skill library healthy.' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function SelfEvolutionSetup({ instance, onClose }: { instance: OpenClawInstance; onClose: () => void }) {
  const [phase, setPhase] = useState<'landing' | 'running' | 'done' | 'error'>('landing')
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  async function start() {
    setPhase('running')
    setOutput('')

    const prompt = buildSetupPrompt(instance.workspacePath)

    try {
      const res = await fetch(`/api/gateway/${instance.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openclaw',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
      })

      if (!res.ok) throw new Error(`Gateway error ${res.status}: ${await res.text()}`)

      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let assembled = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') { reader.cancel(); break }
          try {
            const chunk = JSON.parse(data)
            const delta = chunk.choices?.[0]?.delta?.content
            if (delta) {
              assembled += delta
              setOutput(assembled)
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
            }
          } catch { /* skip malformed SSE */ }
        }
      }

      setPhase('done')
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  function copy() {
    navigator.clipboard.writeText(output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 660, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(96,165,250,0.2))', border: '1px solid rgba(167,139,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Brain size={18} style={{ color: '#a78bfa' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Setup Self Evolution</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {instance.name} · Agent spawns a subagent to install its own evolution framework
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {output && (
              <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            )}
            <button onClick={onClose} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }} ref={scrollRef}>

          {/* ── Landing ── */}
          {phase === 'landing' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.7 }}>
                Sends a setup task to <strong style={{ color: 'var(--accent)' }}>{instance.name}</strong>. The agent spawns a dedicated subagent that installs four interlocking learning systems using its own terminal tool — no direct SSH from the panel.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                {PILLARS.map(p => (
                  <div key={p.title} style={{ background: p.bg, border: `1px solid ${p.border}`, borderRadius: 10, padding: '11px 13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      {p.icon}
                      <span style={{ fontWeight: 600, fontSize: 13, color: p.color }}>{p.title}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>{p.desc}</p>
                  </div>
                ))}
              </div>

              {/* How it works */}
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>How it works</p>
                {[
                  ['You click "Start"', 'The panel sends a structured setup task to the agent\'s chat API'],
                  ['Agent spawns subagent', 'The agent delegates the setup to a dedicated subagent with full terminal access'],
                  ['Subagent installs framework', 'Creates dirs, writes evolution_tools.py, SKILL.md files, and initialises the SQLite session DB'],
                  ['Ready to evolve', 'Agent confirms installation — paste EVOLUTION_INSTRUCTIONS.md into SOUL.md to activate'],
                ].map(([title, desc]) => (
                  <div key={title} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                    <ArrowRight size={12} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}> — {desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Running / Done / Error ── */}
          {(phase === 'running' || phase === 'done' || phase === 'error') && (
            <div>
              {phase === 'running' && !output && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
                  Agent is setting up evolution framework…
                </div>
              )}

              {phase === 'done' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '9px 14px', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 9 }}>
                  <CheckCircle size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>Evolution framework installed</span>
                </div>
              )}

              {phase === 'error' && (
                <div style={{ marginBottom: 14, padding: '9px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 9, fontSize: 13, color: 'var(--error)' }}>
                  Setup failed — see output below. Check the agent has a terminal/bash tool enabled.
                </div>
              )}

              <pre style={{ fontSize: 13, lineHeight: 1.75, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)', margin: 0 }}>
                {output}
                {phase === 'running' && (
                  <span style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--accent)', animation: 'pulse 1s infinite', marginLeft: 2, verticalAlign: 'middle', borderRadius: 2 }} />
                )}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0 }}>
          {phase === 'landing' && (
            <>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={start} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Bot size={14} /> Start — Agent Installs Evolution Framework
              </button>
            </>
          )}

          {phase === 'running' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
              Agent is working…
            </div>
          )}

          {(phase === 'done' || phase === 'error') && (
            <>
              <button
                onClick={() => { setPhase('landing'); setOutput('') }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}
              >
                <RefreshCw size={12} /> {phase === 'error' ? 'Try Again' : 'Reinstall'}
              </button>
              <button
                onClick={start}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.35)', background: 'rgba(167,139,250,0.08)', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                <Sparkles size={13} /> Run Setup Again
              </button>
              <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
