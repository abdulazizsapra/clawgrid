<div align="center">

<img src="public/logo.png" alt="ClawGrid Logo" width="96" height="96" style="border-radius: 20px" />

# ClawGrid

**The only OpenClaw control panel built for fleets — not just single instances.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-2026.x-orange)](https://openclaw.ai)

[**Quick Start**](#quick-start) · [**Features**](#features) · [**Configuration**](#configuration) · [**Deploy**](#deploy-to-production) · [**Contributing**](#contributing)

</div>

---

## Why ClawGrid exists

Every other OpenClaw dashboard manages **one instance**. ClawGrid manages **your whole fleet**.

When you run multiple OpenClaw agents across different servers — an Atlas research agent, a Forge task-runner, an Echo voice agent — you end up SSH-ing into each machine separately to check logs, fix failed crons, review memory, or update configs. That's the problem ClawGrid solves.

> **"The only OpenClaw panel with two-hop SSH, agent self-analysis, visual schedule builder, and per-job cost estimates."**

---

## What makes ClawGrid different

| Feature | ClawGrid | Other dashboards |
|---|:---:|:---:|
| Manage multiple instances from one UI | ✅ | ❌ Single instance only |
| Two-hop SSH (private VMs behind bastion) | ✅ | ❌ Direct only |
| Agent self-analysis (asks the agent to audit itself) | ✅ | ❌ |
| Visual schedule builder (no raw cron expressions) | ✅ | ❌ |
| Per-job cost estimates with model switch recommendations | ✅ | ❌ |
| Security guardrails editor (exec-approvals live editor) | ✅ | ❌ |
| Full channel configuration UI (Slack, Telegram, Discord) | ✅ | ❌ |
| Works on any server (AWS, Hetzner, bare metal, VPS) | ✅ | ⚠️ Cloud-specific |
| Theme system (4 themes, 6 accent colours) | ✅ | ❌ |

---

## Quick Start

```bash
git clone https://github.com/abdulazizsapra/clawgrid
cd clawgrid
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → Fleet Overview → Add Instance.

**Optional auth:**
```bash
echo "PANEL_PASSWORD=yourpassword\nPANEL_SECRET=$(openssl rand -hex 32)" > .env.local
npm run dev
```

---

## Features

### 🏠 Fleet Overview
See every agent in one place — status, version, active cron count, conversation messages, memory size, and a health badge. Know immediately which agents need attention without touching a terminal.

### 💬 Chat
Stream chat with any agent via the OpenClaw gateway API. Full markdown rendering with code blocks, system prompt support, stop-generation button, and per-agent conversation history persisted in the browser.

### ✨ Self-Improve (Unique)
Six automated analyzers score your agent from 0–100 across: **Cost**, **Cron Health**, **Memory**, **Logs**, **Security**, and **Skills**. Every finding includes a specific action item. Then hit **"Ask Agent to Self-Analyze"** to stream the agent's own audit live — it uses its tools to inspect its files and report back.

### 📅 Cron Management
Create, edit, delete, and bulk-pause scheduled jobs. **No raw cron expressions** — a visual schedule builder lets you pick Daily / Weekly / Monthly / Hourly. Calendar view shows which days have jobs scheduled. Sort by next run time. One-click error reset.

### 🔒 Security
Built-in risk scanner checks for: passwordless sudo, `ask: off` exec mode, wildcard allowlist patterns, empty blocklist, and more — all colour-coded by severity with fix instructions. Live guardrail editor writes changes directly to `exec-approvals.json` over SSH.

### 💰 Cost Analysis
Estimates monthly token cost per cron job using real model pricing. Flags jobs using expensive models unnecessarily and shows exact savings if you switch to Haiku. Runs in seconds.

### 📡 Channels
Full channel configuration UI — not raw JSON. Configure Slack (tokens, DM policy, allowed users), Telegram, Discord, WhatsApp, and Email. Add new channels via a wizard. Saves back to `openclaw.json` over SSH.

### 🧠 Memory Browser
Browse and search the agent's SQLite memory database. Analysis tab flags stale files (30+ days), oversized chunks, and fragmentation — with plain-English suggestions.

### 🔧 Skills & Plugins
Enable/disable any of 90+ plugins with one click. Create and edit custom `SKILL.md` definitions. View and browse shell scripts. Tool inventory tab shows safe bins, channel restrictions, and enabled skills per agent.

### 📊 Health Monitor
Live system metrics: memory, CPU load, disk. Gateway uptime history bar (updates every 30s). Installed vs latest version with one-click update that streams the install log in real time.

### 🎨 Panel Settings
Four themes (Dark, Midnight, Forest, Slate), six accent colours, logo upload, and display preferences — all persisted to `localStorage` and applied instantly.

---

## How SSH works

ClawGrid supports both connection modes with zero extra config:

```
# Direct (public server)
ClawGrid ──SSH──▶ OpenClaw server

# Jump host (private VM behind bastion)
ClawGrid ──SSH──▶ Bastion/Jump host ──SSH──▶ OpenClaw server (private IP)
```

SSH keys live on the **panel's server only** — they never reach the browser. All file operations run through Next.js API routes.

---

## Configuration

Add instances via the **Add Instance** UI, or edit `data/instances.json` directly.

A three-agent fleet looks like this:

```json
[
  {
    "id": "atlas",
    "name": "Atlas — Research",
    "role": "command",
    "gatewayUrl": "http://localhost:4000",
    "token": "your-gateway-token",
    "sshHost": "10.0.0.10",
    "sshPort": 22,
    "sshJumpHost": "deploy@bastion.example.com",
    "sshUser": "openclaw",
    "sshKeyPath": "~/.ssh/clawgrid",
    "workspacePath": "/home/openclaw/.openclaw"
  },
  {
    "id": "forge",
    "name": "Forge — Builder",
    "role": "supply",
    "gatewayUrl": "http://localhost:4001",
    "token": "your-gateway-token",
    "sshHost": "10.0.0.11",
    "sshPort": 22,
    "sshJumpHost": "deploy@bastion.example.com",
    "sshUser": "openclaw",
    "sshKeyPath": "~/.ssh/clawgrid",
    "workspacePath": "/home/openclaw/.openclaw"
  },
  {
    "id": "echo",
    "name": "Echo — Voice",
    "role": "voice",
    "gatewayUrl": "http://localhost:4002",
    "token": "your-gateway-token",
    "sshHost": "10.0.0.12",
    "sshPort": 22,
    "sshJumpHost": "deploy@bastion.example.com",
    "sshUser": "openclaw",
    "sshKeyPath": "~/.ssh/clawgrid",
    "workspacePath": "/home/openclaw/.openclaw"
  }
]
```

> **Finding your gateway token:**
> `ssh user@server 'python3 -c "import json; print(json.load(open(\"/home/openclaw/.openclaw/openclaw.json\"))[\"gateway\"][\"auth\"][\"token\"])"'`

> **If your gateway is loopback-only** (default):
> ```bash
> ssh -N -L 4000:localhost:18789 user@server
> ```
> Then set `"gatewayUrl": "http://localhost:4000"`.

---

## Deploy to Production

```bash
# On your server
git clone https://github.com/abdulazizsapra/clawgrid /opt/clawgrid
cd /opt/clawgrid && npm install && npm run build

# Environment
echo "PANEL_PASSWORD=strong-password" >> .env.local
echo "PANEL_SECRET=$(openssl rand -hex 32)" >> .env.local

# Run with PM2
pm2 start npm --name clawgrid -- start
pm2 save && pm2 startup
```

**Nginx** (required for SSE streaming — chat won't work without `proxy_buffering off`):

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_set_header Host $host;
}
```

---

## Architecture

```
Browser
  │
  ▼
ClawGrid (Next.js 15, App Router)
  │
  ├─ /api/gateway/:id/*  ──HTTP──▶  OpenClaw Gateway (:18789)
  │                                  Chat · Health · Config
  │
  └─ /api/ssh/:id        ──SSH──▶   Server filesystem
                                     Crons · Memory · Logs · Skills
```

**Stack:** Next.js 15 · React 19 · TypeScript 5 · ssh2 · Recharts · All inline styles (no Tailwind runtime, no component library)

---

## Server Requirements

Runs on anything OpenClaw runs on:

| Requirement | Notes |
|---|---|
| Linux or macOS | Ubuntu 22.04+ recommended |
| Python 3.8+ | Used for SSH file operations |
| SSH on port 22 | Or any port — configurable |
| OpenClaw running | With gateway on :18789 |

**Tested on:** AWS EC2, Azure VMs, GCP Compute, Hetzner, DigitalOcean, Vultr, bare metal, Mac mini.

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/abdulazizsapra/clawgrid
cd clawgrid && npm install
npm run dev     # dev server with hot reload
npm run build   # production build
npm run lint    # ESLint
```

**Good first issues:** improving the channel wizard, adding more analyzer modules to Self-Improve, adding pagination to the Sessions view.

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

Built for the OpenClaw community · If ClawGrid saves you time, a ⭐ means a lot

</div>
