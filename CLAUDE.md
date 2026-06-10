# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A central control panel (Next.js 15 + React 19) for managing multiple OpenClaw AI agent instances running on remote servers. Unlike single-instance dashboards, this panel maintains a registry of instances and connects to each via their OpenClaw gateway API plus SSH for management operations.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server on :3000 (Turbopack)
npm run build        # production build
npm start            # run production build on :3000
npm run lint         # ESLint
npx vitest           # unit tests
npx playwright test  # e2e tests
```

## Example Infrastructure

A typical multi-instance setup uses a bastion/hub server with autossh tunnels to private agent VMs:

| Instance | Role | Gateway URL (on hub) | SSH Access |
|---|---|---|---|
| agent-1 | command | http://localhost:4000 | direct or via jump host |
| agent-2 | supply  | http://localhost:4001 | direct or via jump host |
| agent-3 | voice   | http://localhost:4002 | direct or via jump host |

All instances run OpenClaw on port 18789. The hub maps them to localhost ports via autossh.

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
      health/page.tsx           — KPI dashboard via fleet.ts SSH Python script
      sessions/page.tsx         — conversation sessions viewer via SSH
      skills/page.tsx           — installed skills/tools manager via SSH
      optimize/page.tsx         — optimization suggestions panel
      security/page.tsx         — security audit view via SSH
      settings/page.tsx         — edit/delete instance from registry
    instances/new/page.tsx      — add a new instance
    settings/page.tsx           — global panel settings (PanelSettings)
    docs/page.tsx               — built-in documentation viewer
    login/page.tsx              — password login form
    api/
      auth/login|logout|status  — session cookie auth endpoints
      instances/route.ts        — GET/POST/DELETE the instance registry (data/instances.json)
      gateway/[instanceId]/
        chat/route.ts           — proxies SSE streaming to gateway /v1/chat/completions
        health/route.ts         — checks /__openclaw/control-ui-config.json
        config/route.ts         — fetches /__openclaw/control-ui-config.json (name, avatar, agentId)
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
    health/HealthMonitor.tsx    — instance KPI cards
    sessions/SessionsView.tsx   — session list and inspector
    skills/SkillsManager.tsx    — skills list and management
    optimize/OptimizePanel.tsx  — performance and config recommendations
    security/SecurityManager.tsx — security audit and controls
    settings/                   — InstanceSettings + AddInstanceForm + PanelSettings
    ThemeLoader.tsx             — injects persisted theme class on mount
  lib/
    instances.ts   — file-based registry CRUD (data/instances.json)
    gateway.ts     — fetchGatewayHealth(), fetchGatewayConfig(), streamChat() (server-safe)
    fleet.ts       — fetchInstanceKPIs(): runs inline Python3 over SSH to aggregate stats
    ssh.ts         — ssh2-based exec helpers: directExec, jumpExec, restartGateway, getGatewayLogs, getSystemStats
    auth.ts        — HMAC-signed session tokens, checkPassword(), createToken(), verifyToken()
    utils.ts       — cn(), statusColor(), relativeTime()
  types/index.ts   — OpenClawInstance, GatewayHealth, CronJob, AgentNode, ChatMessage
middleware.ts      — Next.js Edge middleware: validates oc_panel_session cookie, redirects to /login
data/
  instances.json   — runtime registry (gitignored; auto-created from defaults on first run)
```

## Key Design Decisions

- **Instance registry** lives in `data/instances.json` (gitignored). On first run the file is created with an empty registry. Add instances via the UI or edit directly.
- **SSH operations** run server-side via `ssh2` in Next.js API routes — the browser never holds SSH keys. The `sshKeyPath` on each instance config must point to a key the Next.js server process can read. Jump hosts are supported via `sshJumpHost: "user@host:port"`.
- **Gateway proxy** (`/api/gateway/[id]/chat`) keeps gateway tokens server-side; the browser only talks to `/api/...` routes.
- **All feature pages** fetch their data client-side after hydration via the SSH exec API — no build-time data. This means pages work even when instances are offline (they show error states).
- **fleet.ts KPIs** are gathered by running an inline Python3 heredoc over SSH. This avoids installing any agents on the remote side — just needs python3 in PATH.
- **Authentication** is optional: set `PANEL_PASSWORD` + `PANEL_SECRET` in `.env.local` to enable. When enabled, `middleware.ts` validates a 7-day HMAC-signed session cookie on every request. Rate limiting (10 attempts/15 min per IP) is in the login route. Leave both env vars empty for open access.

## Environment Variables

```bash
PANEL_PASSWORD=   # panel login password (leave empty to disable auth)
PANEL_SECRET=     # random secret for signing session cookies (required when PANEL_PASSWORD is set)
                  # generate with: openssl rand -hex 32
```

## Deployment

```bash
git clone <repo> /opt/clawgrid
cd /opt/clawgrid
cp .env.example .env.local   # set PANEL_PASSWORD and PANEL_SECRET
npm install && npm run build

# Run with PM2:
pm2 start npm --name "clawgrid" -- start
pm2 save
```

Nginx: add `proxy_buffering off` on the `/api/gateway/` location for SSE streaming to work.
