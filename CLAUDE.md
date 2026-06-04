# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A central control panel (Next.js 15 + React 19) for managing multiple OpenClaw AI agent instances running on remote Azure VMs. Unlike single-instance dashboards (e.g. clawport-ui), this panel maintains a registry of instances and connects to each via their OpenClaw gateway API plus SSH for management operations.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server on :3000 (Turbopack)
npm run build        # production build
npm start            # run production build on :3000
npm run lint         # ESLint
```

## Azure Infrastructure

Three OpenClaw VMs all in `your-resource-group` (Australia East), accessed through `hub-server` (bastion.example.com):

| VM | Role | Private IP | Tunneled Port on hub-server | SSHFS Mount |
|---|---|---|---|---|
| vm-openclaw | Command | 10.0.0.10 | 4000 | /mnt/openclaw-command |
| vm-tasks | Supply | 10.0.0.11 | 4001 | /mnt/openclaw-supply |
| vm-voice | Voice | 10.0.0.12 | 4002 | /mnt/openclaw-voice |

All VMs run **OpenClaw 2026.5.26** on port 18789. `hub-server` has autossh tunnels mapping those to localhost:4000/4001/4002, and nginx with HTTP Basic Auth proxying ports 3000/3001/3002 externally.

The control panel is intended to run **on hub-server** where gateway URLs are `http://localhost:4000/4001/4002`. SSH keys live at `/root/.ssh/id_ed25519`.

## Architecture

```
src/
  app/
    fleet/page.tsx              — server component: fetches all instance health in parallel
    instances/[instanceId]/
      layout.tsx                — wraps all instance pages with Sidebar
      chat/page.tsx             — streams to /v1/chat/completions via proxy API route
      crons/page.tsx            — reads crons.json via SSH exec
      memory/page.tsx           — reads MEMORY.md + memory/ dir via SSH exec
      cost/page.tsx             — parses daily .jsonl usage logs via SSH exec
      agents/page.tsx           — reads agents.json or scans for SOUL.md files
      channels/page.tsx         — reads openclaw.json plugins config via SSH
      logs/page.tsx             — tails gateway.log + system stats via SSH
      settings/page.tsx         — edit/delete instance from registry
    instances/new/page.tsx      — add a new instance
    api/
      instances/route.ts        — GET/POST/DELETE the instance registry (data/instances.json)
      gateway/[instanceId]/
        chat/route.ts           — proxies SSE streaming to gateway /v1/chat/completions
        health/route.ts         — checks /__openclaw/control-ui-config.json
      ssh/[instanceId]/route.ts — SSH actions: logs | stats | restart | exec
  components/
    layout/Sidebar.tsx          — collapsible sidebar with instance switcher
    fleet/FleetGrid.tsx         — status cards with quick-links per instance
    chat/ChatPanel.tsx          — streaming SSE chat, localStorage history
    crons/CronMonitor.tsx       — list + pause/resume cron jobs
    memory/MemoryBrowser.tsx    — file-picker + search over memory files
    logs/LogViewer.tsx          — log tail + system stats + gateway restart
    cost/CostDashboard.tsx      — daily cost chart from usage .jsonl logs
    agents/AgentsView.tsx       — agent list + SOUL.md viewer
    channels/ChannelsView.tsx   — plugin grid from openclaw.json
    settings/                   — InstanceSettings + AddInstanceForm
  lib/
    instances.ts   — file-based registry CRUD (data/instances.json)
    gateway.ts     — fetchGatewayHealth(), streamChat() (server-safe)
    ssh.ts         — ssh2-based exec helpers: restart, logs, stats
    utils.ts       — cn(), statusColor(), relativeTime()
  types/index.ts   — OpenClawInstance, GatewayHealth, CronJob, etc.
data/
  instances.json   — runtime registry (gitignored; auto-created from defaults on first run)
```

## Key Design Decisions

- **Instance registry** lives in `data/instances.json` (gitignored). On first run the file is created from defaults matching the known Azure VMs. Edit via UI or directly.
- **SSH operations** run server-side via `ssh2` in Next.js API routes — the browser never holds SSH keys. The `sshKeyPath` on each instance config must point to a key the Next.js server process can read.
- **Gateway proxy** (`/api/gateway/[id]/chat`) keeps gateway tokens server-side; the browser only talks to `/api/...` routes.
- **All feature pages** (chat, crons, memory, cost, logs) fetch their data client-side after hydration via the SSH exec API — no build-time data. This means pages work even when instances are offline (they show error states).

## Deployment to hub-server

```bash
# On hub-server as root or clawport user:
git clone <repo> /opt/openclaw-panel
cd /opt/openclaw-panel
npm install
npm run build

# Run with PM2:
pm2 start npm --name "openclaw-panel" -- start
pm2 save

# Update nginx to proxy port 3000 → localhost:3000 (the panel)
# instead of the current direct gateway proxy
```

Nginx currently proxies `3000 → localhost:4000` (gateway). Change it to proxy to the panel (`localhost:3000`) and add a new internal route for the gateway if needed.
