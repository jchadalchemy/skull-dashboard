# Skull Dashboard — Product Specification

**Author:** Skull 💀  
**Date:** 2026-04-03  
**Status:** Approved by Jay  
**Repo:** `jchadalchemy/skull-dashboard`

---

## Problem Statement

Skull (OpenClaw AI assistant) and Jay (human operator) manage a complex system of tasks, decisions, commitments, client instances, and service health through YAML state files. Currently, the only way to see this state is through Slack messages or asking Skull to read files — both are lossy, ephemeral, and provide no persistent overview.

The #skull-status Slack channel was a workaround: a pinned status board updated manually. It devolved into a log stream of fleet health dumps, cron alerts, and system messages — noise instead of signal.

**Core need:** A live, always-available dashboard that renders the current state of the system so both Jay and Skull always have a "home screen" to return to.

---

## Goals

1. **Visibility** — See tasks, decisions, commitments, blockers, and service health at a glance
2. **Currency** — Dashboard reflects live state (reads YAML files on each load/refresh)
3. **Zero maintenance** — No manual updates needed; it reads the source-of-truth files directly
4. **Lightweight** — Static HTML + JS served from existing infrastructure (port 8083 doc server or dedicated port)
5. **Foundation** — Architecture that can grow into a full interaction layer (voice, structured inputs, file uploads) later

---

## Non-Goals (v1)

- No chat interface (Slack stays for conversation)
- No write operations (read-only dashboard)
- No authentication (internal network only, same as doc server)
- No LiveKit/voice integration (future)
- No file upload handling (future)
- No mobile-specific optimization (desktop-first, responsive is fine)

---

## Data Sources

All data lives in `/home/clawdbot/clawd/memory/state/` as YAML files:

| File | What it shows |
|------|--------------|
| `hot.yaml` | Active sprint, top tasks, blockers, client status, services, financial summary |
| `decisions.yaml` | Anchored decisions with execution status |
| `commitments.yaml` | Promises made to people with deadlines |
| `activity-feed.yaml` | Recent actions (append-only log) |
| `services.yaml` | Service health and port mapping |

---

## Architecture

### Backend: Simple Node.js API Server

A lightweight Express (or plain `http`) server that:
1. Serves the static HTML/CSS/JS dashboard
2. Exposes REST endpoints that read and parse YAML files on demand:
   - `GET /api/hot` → parsed `hot.yaml`
   - `GET /api/decisions` → parsed `decisions.yaml`
   - `GET /api/commitments` → parsed `commitments.yaml`
   - `GET /api/activity` → last N entries from `activity-feed.yaml`
   - `GET /api/services` → parsed `services.yaml`
   - `GET /api/health` → quick health check (all files readable, timestamps)

**Port:** 8084 (next to doc server on 8083)

### Frontend: Single-Page HTML Dashboard

Pure HTML + CSS + vanilla JS (no framework needed for v1). Sections:

#### Header
- "Skull Dashboard 💀" title
- Last refresh timestamp
- Auto-refresh toggle (default: every 30 seconds)

#### Sprint Banner
- Current active sprint name from `hot.yaml`

#### Cards Layout (CSS Grid, 2-3 columns)

**Card 1: Tasks**
- Render `top_tasks` from `hot.yaml`
- Color-code by emoji prefix (🔥 = red, 🔴 = orange, etc.)
- Show status and `verified_at` age

**Card 2: Blockers**
- Render `blockers` from `hot.yaml`
- Show owner and age

**Card 3: Commitments**
- Render from `commitments.yaml`
- Highlight overdue items in red
- Show deadline countdown (e.g., "2h overdue" or "due in 3h")

**Card 4: Decisions**
- Recent decisions from `decisions.yaml`
- Show `executed` status (✅ executed, ⚠️ not executed)
- Filter: show unexecuted first

**Card 5: Clients**
- Render `clients` section from `hot.yaml`
- Status badge per client (LIVE, SUSPENDED, etc.)

**Card 6: Services**
- Fleet health summary from `hot.yaml` → `services_summary`
- Gateway status, disk, cron health

**Card 7: Activity Feed**
- Last 20 entries from `activity-feed.yaml`
- Scrollable, reverse chronological
- Timestamp + source + action

**Card 8: Financial**
- Bank balance, burn rate, runway from `hot.yaml` → `financial`

#### Footer
- Schedule C status block from `hot.yaml`
- Links: doc server, GitHub, Slack workspace

### Visual Design
- Dark theme (Skull vibes — dark background, light text)
- Monospace accents for technical data
- Clean, dense information display (think Grafana meets Notion)
- Status colors: green (#4ade80), yellow (#facc15), red (#f87171), gray (#9ca3af)
- Card borders with subtle glow based on status

---

## File Structure

```
skull-dashboard/
├── README.md
├── package.json
├── server.js              # Node.js API server
├── public/
│   ├── index.html         # Main dashboard page
│   ├── style.css          # Dashboard styles
│   └── dashboard.js       # Frontend logic (fetch + render)
└── .gitignore
```

---

## Dependencies

Minimal:
- `js-yaml` — YAML parsing (already available on the system)
- `express` — HTTP server (or use Node built-in `http` if preferred)
- No frontend dependencies — vanilla JS only

---

## Deployment

1. `npm install` in the repo directory
2. Start: `node server.js` (runs on port 8084)
3. Access: `http://5.78.130.196:8084` or `http://localhost:8084`
4. Future: add to systemd or supervisor for persistence

### Environment Variables
- `PORT` — server port (default: 8084)  
- `STATE_DIR` — path to state files (default: `/home/clawdbot/clawd/memory/state`)
- `REFRESH_INTERVAL` — auto-refresh milliseconds (default: 30000)

---

## Success Criteria

1. Dashboard loads and renders all 8 cards with live data
2. Auto-refresh works without page reload (fetch + re-render)
3. Overdue commitments are visually prominent
4. Unexecuted decisions are visually flagged
5. Page loads in <1 second
6. Works in Chromium and Safari

---

## Future Roadmap (not v1)

- **v2:** Structured input — click a task to open action panel, create commitments from UI
- **v3:** LiveKit voice integration — talk to Skull from the dashboard
- **v4:** File upload with intent tagging ("this is a receipt for Zoho")
- **v5:** Client-facing version — each Hadaforge client gets their own dashboard
- **v6:** Mobile PWA

---

*This spec is the single source of truth for the dashboard build. Coding agent should implement exactly what's described here, no more, no less.*
