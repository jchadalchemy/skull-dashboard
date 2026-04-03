# Skull Dashboard 💀

Live operational dashboard for Hadalchemy/Skull. Renders state from YAML files (hot.yaml, decisions.yaml, commitments.yaml, activity-feed.yaml, services.yaml).

## Quick Start

```bash
npm install
STATE_DIR=/home/clawdbot/clawd/memory/state node server.js
```

Dashboard: http://localhost:8084

## Spec

See [SPEC.md](./SPEC.md) for the full product specification.

## Architecture

- **Backend:** Node.js + Express, reads YAML state files via REST API
- **Frontend:** Vanilla HTML/CSS/JS, auto-refreshing every 30s
- **Port:** 8084 (configurable via PORT env var)

## License

Private — Hadalchemy LLC
