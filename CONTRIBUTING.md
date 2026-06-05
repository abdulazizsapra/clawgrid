# Contributing to ClawGrid

Thank you for helping make ClawGrid better. This guide covers everything you need to get started.

## How to contribute

### Reporting bugs

Open an issue using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS, Node version, and browser

### Suggesting features

Open an issue using the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). Most valuable contributions are things that work for **any** OpenClaw setup, not just specific hosting providers.

### Pull requests

1. Fork the repo and create a branch from `main`
2. Follow the code style (inline styles, no Tailwind classes, TypeScript strict)
3. Test your changes with a real OpenClaw instance if possible
4. Keep PRs focused — one feature or fix per PR
5. Update relevant docs if your change affects setup or config

## Development setup

```bash
git clone https://github.com/abdulazizsapra/clawgrid
cd clawgrid
npm install
npm run dev
```

You'll need a running OpenClaw instance with SSH access. See [ONBOARDING.md](ONBOARDING.md) for how to set up the tunnel and configure instances.

## Code style

- **Components**: `'use client'` at top, all styling via inline `style={{}}` with CSS variables (`var(--accent)`, `var(--surface)` etc.)
- **SSH helpers**: use `sshExec` imported from `@/lib/utils` — do not define a local copy
- **Error handling**: all `JSON.parse` on SSH output must be wrapped in try/catch; all `fetch` calls must have `.catch()` or be in try/catch
- **No external UI libraries**: keep the zero-dependency spirit for the UI layer
- **TypeScript**: no `as any` unless absolutely unavoidable (and comment why)

## Good first issues

These areas would benefit most from contributions:

- **Pagination** in Sessions and Agent views (currently loads all messages at once)
- **More Self-Improve analyzers** — add new scoring modules to `OptimizePanel.tsx`
- **Keyboard shortcuts** — Cmd+K search, arrow key navigation in lists
- **Export** — JSON/CSV download for crons, memory, sessions
- **More channel types** — extend `ChannelsView.tsx` with additional channel definitions
- **Test coverage** — Vitest is already in the project, tests are sparse

## Questions?

Open a discussion or an issue — we're friendly.
