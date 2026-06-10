'use client'
import { useState, useRef } from 'react'
import { sshExec } from '@/lib/utils'
import {
  Brain, X, CheckCircle, XCircle, Loader2, Sparkles,
  Database, BookOpen, Cpu, Zap, ArrowRight, Copy, Check,
  ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react'
import type { OpenClawInstance } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skip'

interface SetupStep {
  id: string
  label: string
  detail: string
  icon: React.ReactNode
  status: StepStatus
  output?: string
}

// ─── Python evolution engine (installed to ~/.openclaw/evolution/) ─────────────

const EVOLUTION_PY = `#!/usr/bin/env python3
"""OpenClaw Evolution Engine — skill/memory/session/curator CLI"""
import sys, json, os, sqlite3, glob, re
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
    if USAGE_PATH.exists():
        return json.loads(USAGE_PATH.read_text())
    return {}

def _save_usage(data):
    USAGE_PATH.write_text(json.dumps(data, indent=2))

def _list_skills():
    skills = []
    for f in glob.glob(str(SKILLS_DIR / "**" / "SKILL.md"), recursive=True):
        text = open(f).read()
        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) == 3:
                try:
                    import yaml
                    meta = yaml.safe_load(parts[1])
                except Exception:
                    meta = {}
                    for line in parts[1].strip().splitlines():
                        if ":" in line:
                            k, v = line.split(":", 1)
                            meta[k.strip()] = v.strip().strip('"')
                skills.append({"name": meta.get("name", Path(f).parent.name),
                               "description": meta.get("description", ""),
                               "path": f, "body": parts[2].strip()})
    return skills

# ── skill commands ──────────────────────────────────────────────────────────

def skill_list():
    skills = _list_skills()
    usage = _load_usage()
    print(json.dumps([{**s, "use_count": usage.get(s["name"], {}).get("use_count", 0),
                        "pinned": usage.get(s["name"], {}).get("pinned", False)} for s in skills], indent=2))

def skill_view(name):
    for s in _list_skills():
        if s["name"] == name:
            usage = _load_usage()
            u = usage.get(name, {})
            u["use_count"] = u.get("use_count", 0) + 1
            u["last_activity_at"] = datetime.utcnow().isoformat()
            usage[name] = u
            _save_usage(usage)
            print(s["body"])
            return
    print(f"Skill '{name}' not found", file=sys.stderr); sys.exit(1)

def skill_create(name, description, content, category="general"):
    d = SKILLS_DIR / category / name
    d.mkdir(parents=True, exist_ok=True)
    body = f"---\\nname: {name}\\ndescription: \\"{description}\\"\\nversion: 1.0.0\\n---\\n\\n{content}\\n"
    (d / "SKILL.md").write_text(body)
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
            usage[name] = u
            _save_usage(usage)
            print(json.dumps({"ok": True})); return
    print(f"Skill '{name}' not found", file=sys.stderr); sys.exit(1)

def skill_delete(name):
    import shutil
    for s in _list_skills():
        if s["name"] == name:
            shutil.move(s["path"], s["path"] + ".archived")
            print(json.dumps({"ok": True, "archived": s["path"] + ".archived"})); return
    print(f"Skill '{name}' not found", file=sys.stderr); sys.exit(1)

# ── memory commands ─────────────────────────────────────────────────────────

def memory_add(store, content):
    data = _load_memory()
    if store not in data: data[store] = []
    data[store].append(content)
    _save_memory(data)
    print(json.dumps({"ok": True, "store": store, "count": len(data[store])}))

def memory_list(store=None):
    data = _load_memory()
    if store:
        print(json.dumps(data.get(store, [])))
    else:
        print(json.dumps(data))

def memory_replace(store, old_text, new_text):
    data = _load_memory()
    if store in data:
        data[store] = [new_text if old_text in e else e for e in data[store]]
    _save_memory(data)
    print(json.dumps({"ok": True}))

def memory_remove(store, old_text):
    data = _load_memory()
    if store in data:
        data[store] = [e for e in data[store] if old_text not in e]
    _save_memory(data)
    print(json.dumps({"ok": True}))

# ── session commands ─────────────────────────────────────────────────────────

def session_save(session_id, role, content):
    conn = _db()
    now = datetime.utcnow().isoformat()
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
    except Exception:
        rows = []
    conn.close()
    print(json.dumps([{"session_id": r[0], "role": r[1], "snippet": r[2], "created_at": r[3]} for r in rows]))

# ── curator commands ─────────────────────────────────────────────────────────

def curator_status():
    usage = _load_usage()
    skills = _list_skills()
    skill_names = {s["name"] for s in skills}
    cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
    stale = [n for n, u in usage.items() if n in skill_names and not u.get("pinned")
             and (u.get("last_activity_at") or "") < cutoff]
    print(json.dumps({"total_skills": len(skills), "tracked": len(usage),
                      "stale": stale, "pinned": [n for n, u in usage.items() if u.get("pinned")]}))

def curator_pin(name, pinned=True):
    usage = _load_usage()
    if name not in usage: usage[name] = {}
    usage[name]["pinned"] = pinned
    _save_usage(usage)
    print(json.dumps({"ok": True, "name": name, "pinned": pinned}))

# ── dispatch ─────────────────────────────────────────────────────────────────

CMDS = {
    "skill list":   lambda a: skill_list(),
    "skill view":   lambda a: skill_view(a[0]),
    "skill create": lambda a: skill_create(a[0], a[1], a[2], a[3] if len(a) > 3 else "general"),
    "skill patch":  lambda a: skill_patch(a[0], a[1], a[2]),
    "skill delete": lambda a: skill_delete(a[0]),
    "memory add":   lambda a: memory_add(a[0], a[1]),
    "memory list":  lambda a: memory_list(a[0] if a else None),
    "memory replace": lambda a: memory_replace(a[0], a[1], a[2]),
    "memory remove": lambda a: memory_remove(a[0], a[1]),
    "session save": lambda a: session_save(a[0], a[1], a[2]),
    "session search": lambda a: session_search(a[0], int(a[1]) if len(a) > 1 else 5),
    "curator status": lambda a: curator_status(),
    "curator pin":  lambda a: curator_pin(a[0]),
    "curator unpin": lambda a: curator_pin(a[0], False),
}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: evolution_tools.py <domain> <command> [args...]", file=sys.stderr); sys.exit(1)
    key = sys.argv[1] + " " + sys.argv[2]
    args = sys.argv[3:]
    fn = CMDS.get(key)
    if not fn:
        print(f"Unknown command: {key}", file=sys.stderr); sys.exit(1)
    try:
        fn(args)
    except Exception as e:
        print(json.dumps({"error": str(e)})); sys.exit(1)
`

// ─── SKILL.md templates ───────────────────────────────────────────────────────

const SKILL_MANAGE_MD = `---
name: skill_manage
description: Create, patch, view, or list procedural skills — reusable workflows saved to disk
version: 1.0.0
---

# When to Use
Use this skill whenever you:
- Solve a non-trivial problem worth saving for the future
- Discover a command, pitfall, or workflow worth remembering
- Find an existing skill is wrong or incomplete (patch it immediately)
- Want to review available skills before starting a complex task

# Commands (run via terminal tool)

## List all skills
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py skill list
\`\`\`

## View a skill
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py skill view "skill-name"
\`\`\`

## Create a new skill
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py skill create "skill-name" "description" "# Steps\\n1. Do X\\n# Pitfalls\\n- Watch out for Y" "category"
\`\`\`

## Patch an existing skill (prefer patch over recreate)
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py skill patch "skill-name" "old text" "new text"
\`\`\`

# Pitfalls
- Always patch first — only create if no related skill exists
- Keep skill content declarative, not instructional prose
- Category should be: general | coding | devops | data | comms
`

const MEMORY_TOOL_MD = `---
name: memory_tool
description: Save and recall factual long-term memory across sessions (user profile + environment facts)
version: 1.0.0
---

# When to Use
Use this skill to persist facts that will still matter in future sessions:
- User preferences, corrections, working style
- Environment facts: project conventions, tool quirks, port numbers
- Decisions made: "we chose X because Y"

Do NOT save: task-specific ephemera, PR numbers, session outcomes, anything stale in 7 days.

# Two Stores
- \`user\` — who the user is, preferences, timezone, role
- \`memory\` — environment/project facts, tool conventions

# Commands

## Add a memory
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py memory add "user" "Prefers concise responses without preamble"
python3 ~/.openclaw/evolution/evolution_tools.py memory add "memory" "Project uses uv not pip. App runs on port 8502."
\`\`\`

## List memories
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py memory list
python3 ~/.openclaw/evolution/evolution_tools.py memory list "user"
\`\`\`

## Replace a memory (when a fact changes)
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py memory replace "memory" "old fact text" "new updated fact"
\`\`\`

## Remove a memory
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py memory remove "memory" "stale fact text"
\`\`\`

# Memory Rules
- Write declarative facts: "User prefers X" not "Always do X"
- Be specific: "Project uses port 4003" not "there is a port"
- One fact per entry — don't bundle multiple facts
`

const SESSION_SEARCH_MD = `---
name: session_search
description: Search past conversation sessions by topic — episodic memory to avoid starting blind
version: 1.0.0
---

# When to Use
Before starting a complex task, search past sessions to recall:
- How a similar problem was solved before
- What was decided in a past conversation
- Whether this task was already attempted

# Commands

## Search sessions
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py session search "query terms here"
python3 ~/.openclaw/evolution/evolution_tools.py session search "deployment issue" 10
\`\`\`

## Save current message to session (for indexing)
\`\`\`bash
python3 ~/.openclaw/evolution/evolution_tools.py session save "session-id" "user" "message content"
\`\`\`

# Notes
- Results include a snippet with the matched passage highlighted
- Search uses full-text with Porter stemming — "deploy" matches "deploying", "deployed"
- Session IDs are typically ISO timestamps or UUIDs
`

// ─── System prompt snippet ────────────────────────────────────────────────────

const EVOLUTION_INSTRUCTIONS = `## Evolution Tools — Active

You have three evolution tools available via the terminal. Use them proactively:

### skill_manage
Before any complex task: \`python3 ~/.openclaw/evolution/evolution_tools.py skill list\`
After solving something non-trivial: save or patch a skill.
Rule: patch first, create only if no related skill exists.

### memory_tool
When you learn a persistent fact about the user or environment:
\`python3 ~/.openclaw/evolution/evolution_tools.py memory add "user|memory" "declarative fact"\`
User store: preferences, corrections, working style.
Memory store: project conventions, tool quirks, environment facts.
Do NOT save: task ephemera, PR numbers, anything stale in 7 days.

### session_search
At the start of complex tasks, search for relevant past context:
\`python3 ~/.openclaw/evolution/evolution_tools.py session search "topic keywords"\`

### Evolution Rules
1. Skills are patch-first — update existing, don't duplicate
2. Memory is declarative ("User prefers X") not instructional ("Always do X")
3. Stale facts (< 7 day relevance) don't belong in memory
4. After every non-trivial session: consider what new skill or memory should be saved
`

// ─── Installation steps builder ───────────────────────────────────────────────

function buildSteps(wp: string): SetupStep[] {
  return [
    {
      id: 'check',
      label: 'Check prerequisites',
      detail: 'Python3, sqlite3, existing install',
      icon: <Cpu size={14} />,
      status: 'pending',
    },
    {
      id: 'dirs',
      label: 'Create directory structure',
      detail: '~/.openclaw/evolution/ · ~/.openclaw/skills/',
      icon: <Database size={14} />,
      status: 'pending',
    },
    {
      id: 'engine',
      label: 'Install evolution engine',
      detail: 'evolution_tools.py — skills, memory, sessions, curator',
      icon: <Cpu size={14} />,
      status: 'pending',
    },
    {
      id: 'skills',
      label: 'Create skill definitions',
      detail: 'skill_manage · memory_tool · session_search',
      icon: <BookOpen size={14} />,
      status: 'pending',
    },
    {
      id: 'db',
      label: 'Initialise session database',
      detail: 'SQLite + FTS5 full-text search index',
      icon: <Database size={14} />,
      status: 'pending',
    },
    {
      id: 'prompt',
      label: 'Write evolution instructions',
      detail: `${wp}/evolution/EVOLUTION_INSTRUCTIONS.md`,
      icon: <Zap size={14} />,
      status: 'pending',
    },
  ]
}

// ─── SSH command for each step ─────────────────────────────────────────────────

async function runStep(instanceId: string, wp: string, stepId: string): Promise<string> {
  switch (stepId) {
    case 'check':
      return sshExec(instanceId, `python3 --version && python3 -c "import sqlite3; print('sqlite3 ok, version:', sqlite3.sqlite_version)" && echo "evolution_installed=$(test -f ~/.openclaw/evolution/evolution_tools.py && echo yes || echo no)"`)

    case 'dirs':
      return sshExec(instanceId, `mkdir -p ~/.openclaw/evolution ~/.openclaw/skills/general ~/.openclaw/skills/coding ~/.openclaw/skills/devops && echo "dirs_ok"`)

    case 'engine': {
      // base64-encode content, pipe via echo to avoid shell quoting issues entirely
      const b64 = btoa(unescape(encodeURIComponent(EVOLUTION_PY)))
      return sshExec(instanceId, `echo '${b64}' | python3 -c "
import base64, sys
from pathlib import Path
content = base64.b64decode(sys.stdin.read().strip()).decode('utf-8')
dest = Path.home() / '.openclaw' / 'evolution' / 'evolution_tools.py'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(content)
print('engine_written ok, size=' + str(len(content)) + ' bytes')
"`)
    }

    case 'skills': {
      const sm64 = btoa(unescape(encodeURIComponent(SKILL_MANAGE_MD)))
      const mt64 = btoa(unescape(encodeURIComponent(MEMORY_TOOL_MD)))
      const ss64 = btoa(unescape(encodeURIComponent(SESSION_SEARCH_MD)))
      return sshExec(instanceId, `python3 - <<'PYEOF'
import base64
from pathlib import Path

base = Path.home() / '.openclaw' / 'skills'
skills = [
  ('evolution/skill_manage', '${sm64}'),
  ('evolution/memory_tool', '${mt64}'),
  ('evolution/session_search', '${ss64}'),
]
for rel_path, b64 in skills:
  d = base / rel_path
  d.mkdir(parents=True, exist_ok=True)
  content = base64.b64decode(b64).decode('utf-8')
  (d / 'SKILL.md').write_text(content)
  print(f'wrote {d}/SKILL.md')
PYEOF`)
    }

    case 'db':
      return sshExec(instanceId, `python3 ~/.openclaw/evolution/evolution_tools.py curator status && echo "db_init_ok"`)

    case 'prompt': {
      const ins64 = btoa(unescape(encodeURIComponent(EVOLUTION_INSTRUCTIONS)))
      return sshExec(instanceId, `python3 -c "
import base64
from pathlib import Path
d = Path.home() / '.openclaw' / 'evolution'
d.mkdir(parents=True, exist_ok=True)
content = base64.b64decode('${ins64}').decode('utf-8')
(d / 'EVOLUTION_INSTRUCTIONS.md').write_text(content)
print('instructions_written ok')
print()
print('--- Add this to your SOUL.md or system prompt ---')
print()
print(content[:300] + '...')
"`)
    }

    default:
      return 'skipped'
  }
}

// ─── Step row ─────────────────────────────────────────────────────────────────

function StepRow({ step, expanded, onToggle }: {
  step: SetupStep
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: step.status === 'done' ? 'rgba(34,197,94,0.12)'
            : step.status === 'error' ? 'rgba(239,68,68,0.12)'
            : step.status === 'running' ? 'rgba(59,130,246,0.12)'
            : 'var(--surface2)',
          border: `1px solid ${step.status === 'done' ? 'rgba(34,197,94,0.3)' : step.status === 'error' ? 'rgba(239,68,68,0.3)' : step.status === 'running' ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
        }}>
          {step.status === 'done'    && <CheckCircle size={13} style={{ color: 'var(--success)' }} />}
          {step.status === 'error'   && <XCircle size={13} style={{ color: 'var(--error)' }} />}
          {step.status === 'running' && <Loader2 size={13} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />}
          {step.status === 'pending' && <span style={{ color: 'var(--text-dim)', opacity: 0.5 }}>{step.icon}</span>}
          {step.status === 'skip'    && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>–</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: step.status === 'pending' ? 'var(--text-muted)' : 'var(--text)' }}>{step.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>{step.detail}</div>
        </div>
        {step.output && (
          <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '2px 4px' }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>
      {expanded && step.output && (
        <pre style={{ margin: 0, padding: '8px 20px 12px 60px', fontSize: 11, fontFamily: "'SF Mono','Fira Code',monospace", color: step.status === 'error' ? 'var(--error)' : 'var(--text-muted)', background: 'var(--surface2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {step.output}
        </pre>
      )}
    </div>
  )
}

// ─── Pillar cards (landing) ───────────────────────────────────────────────────

const PILLARS = [
  { icon: <BookOpen size={16} style={{ color: '#a78bfa' }} />, title: 'Skills', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)', desc: 'Procedural memory saved as SKILL.md files. Loaded before every task. Self-patching when new pitfalls are found.' },
  { icon: <Brain size={16} style={{ color: '#34d399' }} />, title: 'Memory', color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)', desc: 'Factual memory about you and your environment across two stores: user profile and env/project facts.' },
  { icon: <Database size={16} style={{ color: '#60a5fa' }} />, title: 'Session Search', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)', desc: 'SQLite FTS5 index of every conversation. Agent can search past sessions to recall how a problem was solved.' },
  { icon: <Zap size={16} style={{ color: '#fbbf24' }} />, title: 'Curator', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)', desc: 'Background skill health monitor. Tracks usage, archives stale skills, protects pinned skills from cleanup.' },
]

// ─── Main component ───────────────────────────────────────────────────────────

export function SelfEvolutionSetup({ instance, onClose }: { instance: OpenClawInstance; onClose: () => void }) {
  const wp = instance.workspacePath
  const [phase, setPhase] = useState<'landing' | 'installing' | 'done'>('landing')
  const [steps, setSteps] = useState<SetupStep[]>(buildSteps(wp))
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  function setStepStatus(id: string, status: StepStatus, output?: string) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, output: output ?? s.output } : s))
  }

  async function runInstall() {
    setPhase('installing')
    setError(null)

    for (const step of buildSteps(wp)) {
      setStepStatus(step.id, 'running')
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
      try {
        const out = await runStep(instance.id, wp, step.id)
        setStepStatus(step.id, 'done', out.trim())
        setExpandedStep(null)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setStepStatus(step.id, 'error', msg)
        setExpandedStep(step.id)
        setError(`Step "${step.label}" failed: ${msg}`)
        return
      }
    }
    setPhase('done')
  }

  const instructionsPath = '~/.openclaw/evolution/EVOLUTION_INSTRUCTIONS.md'
  const cmd = `cat ${instructionsPath}`

  function copyCmd() {
    navigator.clipboard.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(96,165,250,0.2))', border: '1px solid rgba(167,139,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Brain size={18} style={{ color: '#a78bfa' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Setup Self Evolution</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{instance.name} · Persistent skills, memory and session search</div>
          </div>
          <button onClick={onClose} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto' }} ref={scrollRef}>

          {/* ── Landing ── */}
          {phase === 'landing' && (
            <div style={{ padding: '20px 20px 0' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.7 }}>
                Installs the <strong style={{ color: 'var(--text)' }}>Hermes Evolution Architecture</strong> on <strong style={{ color: 'var(--accent)' }}>{instance.name}</strong> — four interlocking systems that let the agent accumulate knowledge and get smarter over time without you repeating yourself.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {PILLARS.map(p => (
                  <div key={p.title} style={{ background: p.bg, border: `1px solid ${p.border}`, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                      {p.icon}
                      <span style={{ fontWeight: 600, fontSize: 13, color: p.color }}>{p.title}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>{p.desc}</p>
                  </div>
                ))}
              </div>

              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>What gets installed</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[
                    '~/.openclaw/evolution/evolution_tools.py — unified CLI (skills + memory + sessions + curator)',
                    '~/.openclaw/skills/evolution/skill_manage/SKILL.md',
                    '~/.openclaw/skills/evolution/memory_tool/SKILL.md',
                    '~/.openclaw/skills/evolution/session_search/SKILL.md',
                    '~/.openclaw/evolution/sessions.db — FTS5 session search index',
                    '~/.openclaw/evolution/EVOLUTION_INSTRUCTIONS.md — paste into SOUL.md',
                  ].map(item => (
                    <div key={item} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                      <ArrowRight size={11} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
                      <code style={{ fontSize: 11, fontFamily: "'SF Mono','Fira Code',monospace", color: 'var(--text)' }}>{item}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Installing ── */}
          {(phase === 'installing' || phase === 'done') && (
            <div>
              {steps.map(step => (
                <StepRow
                  key={step.id}
                  step={step}
                  expanded={expandedStep === step.id}
                  onToggle={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                />
              ))}

              {error && (
                <div style={{ padding: '12px 20px', fontSize: 13, color: 'var(--error)', background: 'rgba(239,68,68,0.06)', borderTop: '1px solid var(--border)' }}>
                  {error}
                </div>
              )}

              {/* Done — next steps */}
              {phase === 'done' && (
                <div style={{ padding: '18px 20px' }}>
                  <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <CheckCircle size={15} style={{ color: 'var(--success)' }} />
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--success)' }}>Evolution platform installed</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
                      The agent can now call <code style={{ fontSize: 11, color: 'var(--accent)' }}>evolution_tools.py</code> to save skills, persist memory, and search past sessions. Skills and memory automatically load into every future session.
                    </p>
                  </div>

                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
                    Next step — paste evolution instructions into SOUL.md
                  </p>
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.6 }}>
                      Tell your agent to load its new instructions into its system prompt (SOUL.md):
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ flex: 1, fontSize: 12, fontFamily: "'SF Mono','Fira Code',monospace", color: 'var(--accent)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', display: 'block' }}>
                        {`cat ~/.openclaw/evolution/EVOLUTION_INSTRUCTIONS.md >> ~/.openclaw/agents/main/SOUL.md`}
                      </code>
                      <button onClick={copyCmd} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                        {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                      </button>
                    </div>
                  </div>

                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                    Try it — say this to your agent in chat
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      'List your available skills using the skill_manage tool',
                      'Save a skill: you know how to restart the gateway via systemctl',
                      'Remember that I prefer concise responses without preamble',
                      'Search past sessions for anything about deployment',
                    ].map(msg => (
                      <div key={msg} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontStyle: 'italic' }}>
                        "{msg}"
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
              <button onClick={runInstall} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Sparkles size={14} /> Install Evolution Platform
              </button>
            </>
          )}
          {phase === 'installing' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
              Installing…
            </div>
          )}
          {phase === 'done' && !error && (
            <>
              <button onClick={() => { setSteps(buildSteps(wp)); setPhase('landing'); setError(null) }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                <RefreshCw size={12} /> Reinstall
              </button>
              <button onClick={onClose} style={{ flex: 1, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Done
              </button>
            </>
          )}
          {error && (
            <>
              <button onClick={() => { setSteps(buildSteps(wp)); setPhase('landing'); setError(null) }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                Back
              </button>
              <button onClick={runInstall} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--error)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <RefreshCw size={13} /> Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
