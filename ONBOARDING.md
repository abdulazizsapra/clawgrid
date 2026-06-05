# ClawGrid — Onboarding Guide

A central management panel for OpenClaw AI agent instances running on **any server** — cloud VMs, bare metal, VPS, or local machines.

## What This Is

ClawGrid lets you manage multiple OpenClaw agent instances from a single UI. It connects to each instance via:
- **Gateway API** — for chat, health checks, and config (HTTP to port 18789)
- **SSH** — for file operations: crons, memory, logs, skills, security

SSH can be either **direct** (panel → server) or **two-hop via a jump host** (panel → bastion → private server). Both are supported out of the box.

---

## Quick Start

### Prerequisites
- Node.js 18+
- SSH access to the server(s) running OpenClaw
- If servers are on a private network: a jump/bastion host with SSH access

### 1. Clone and install

```bash
git clone https://github.com/abdulazizsapra/clawgrid
cd clawgrid
npm install
```

### 2. Configure instances

On first run, `data/instances.json` is created from a blank template. Edit it directly, or use the **Fleet → Add Instance** UI.

**Minimal config (direct SSH, public server):**
```json
{
  "id": "my-agent",
  "name": "My Agent",
  "role": "command",
  "gatewayUrl": "http://<server-ip>:18789",
  "token": "<gateway-bearer-token>",
  "sshHost": "<server-ip>",
  "sshPort": 22,
  "sshUser": "openclaw",
  "sshKeyPath": "/path/to/your/key",
  "workspacePath": "/home/openclaw/.openclaw"
}
```

**With jump host (private server behind bastion):**
```json
{
  "id": "private-agent",
  "name": "Agent",
  "role": "command",
  "gatewayUrl": "http://localhost:4000",
  "token": "<token>",
  "sshHost": "10.0.0.5",
  "sshPort": 22,
  "sshJumpHost": "user@<bastion-ip>",
  "sshUser": "openclaw",
  "sshKeyPath": "/path/to/your/key",
  "workspacePath": "/home/openclaw/.openclaw"
}
```

**Finding your gateway token:**
```bash
ssh user@server 'python3 -c "import json; print(json.load(open(\"/home/openclaw/.openclaw/openclaw.json\")).get(\"gateway\",{}).get(\"auth\",{}).get(\"token\"))"'
```

**SSH key** — must be passphrase-free. Generate one and add it to the server:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/clawgrid -N ""
ssh-copy-id -i ~/.ssh/clawgrid.pub user@server
```

### 3. Gateway port forwarding (if gateway is loopback-only)

OpenClaw binds to `127.0.0.1:18789` by default. If your panel isn't running on the same machine, forward the port:

```bash
# Simple tunnel (one server)
ssh -N -L 4000:localhost:18789 user@server

# Multiple servers via a jump host
ssh -N \
  -L 4000:localhost:18789 \
  -L 4001:10.0.0.6:18789 \
  -L 4002:10.0.0.7:18789 \
  user@jump-host
```

Then set `gatewayUrl: "http://localhost:4000"` in your instance config.

### 4. Start the dev server

```bash
npm run dev
# → http://localhost:3000
```

### 5. Enable auth (optional)

```env
# .env.local
PANEL_PASSWORD=your-password-here
PANEL_SECRET=any-long-random-string
```

Restart the server. All routes require the password. Leave `PANEL_PASSWORD` blank for open access.

---

## Server Requirements

ClawGrid connects to any Linux/macOS server running OpenClaw. The server needs:

| Requirement | Why |
|---|---|
| OpenClaw installed | Obviously |
| SSH access (port 22) | For file operations |
| Python 3 available | Used for SSH file manipulation commands |
| Gateway running on port 18789 | For chat and health checks |
| SSH user with read/write access to `~/.openclaw/` | For crons, memory, security config |

Tested on: Ubuntu 22.04, Ubuntu 24.04, Debian 12, macOS. Any modern Linux with Python 3.8+ works.

**Supported hosting providers**: AWS EC2, Azure VMs, GCP Compute, Hetzner, DigitalOcean, Linode, Vultr, bare metal, Mac mini — anything you can SSH into.

---

## Deployment to a Server

To run ClawGrid itself on a server (so it's always accessible):

```bash
# On the server where you want to run the panel
git clone <repo> /opt/clawgrid
cd /opt/clawgrid
npm install
npm run build

# Set up environment
cat > .env.local << 'EOF'
PANEL_PASSWORD=your-secure-password
PANEL_SECRET=$(openssl rand -hex 32)
EOF

# Start with PM2
pm2 start npm --name "clawgrid" -- start
pm2 save
pm2 startup
```

### Nginx reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name clawgrid.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_buffering off;         # Required for SSE streaming (chat)
        proxy_read_timeout 3600s;
    }
}
```

---

## Features

| Page | What it does |
|---|---|
| **Fleet** | Overview of all instances — status, version, KPIs, quick links |
| **Chat** | Stream chat with any agent (system prompt, stop button, markdown) |
| **Sessions** | Full conversation history with search and tool call display |
| **Health** | System metrics, gateway status, one-click update |
| **Security** | Risk scanner, exec approval viewer, guardrail editor |
| **Self-Improve** | Automated audit + ask the agent to analyze itself live |
| **Agents** | Agent list, tool inventory, skill configuration |
| **Crons** | Full cron management with schedule builder and calendar view |
| **Skills** | Plugins, custom skills, scripts |
| **Memory** | SQLite memory browser with analysis |
| **Cost** | Cron execution activity dashboard |
| **Channels** | Configure Slack, Telegram, Discord, etc. |
| **Logs** | Live log tail + gateway restart |
| **Panel Settings** | Theme, logo, accent colour, auth |

---

## Security Notes

- SSH keys are read server-side only — never sent to the browser
- Gateway tokens are proxied through `/api/gateway/*` — browser never sees them
- Auth cookies are HMAC-signed (SHA-256), httpOnly, 7-day expiry
- Enable `secure: true` on the session cookie when running behind HTTPS
- Restrict SSH access on your servers to known IPs where possible
- Review exec-approvals on each agent via the Security page

---

## Troubleshooting

**"Internal Server Error" on any page**
→ Clear stale build cache: `rm -rf .next && npm run dev`

**SSH exec fails / "channel open failed"**
→ Verify the SSH key path in `data/instances.json` and that it's passphrase-free
→ Test manually: `ssh -i /path/to/key user@host echo ok`

**Jump host connection fails**
→ Ensure the SSH key works for the jump host first: `ssh -i /path/to/key user@jump-host echo ok`
→ Check `sshJumpHost` format: `user@host` or `user@host:port`

**Gateway shows offline**
→ The gateway may be loopback-only — set up a port forward tunnel
→ Verify the token matches `openclaw.json → gateway.auth.token` on the server

**Chat doesn't stream**
→ Nginx must have `proxy_buffering off` — SSE requires un-buffered responses

**"Incorrect password" on login**
→ Check `.env.local` has `PANEL_PASSWORD=` set and restart the server after editing
