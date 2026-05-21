# Lighter HYPE Live Dashboard

Broadcast-ready dashboard for a Passivbot instance running on Lighter and trading `HYPE`.
The repo contains a FastAPI backend, a React frontend, and an OBS-friendly `/stream` route locked to `1920x1080`.

<p align="center">
  <img src="screen.png" alt="Passivbot Lighter streaming dashboard screenshot" width="1200" />
</p>

## What it does

- Pulls fills, health, and position context from a remote Passivbot host over SSH.
- Rebuilds metrics locally in SQLite and enriches them with live Lighter market data.
- Streams state to the frontend over WebSocket for both a regular dashboard and a stream layout.

## Current dashboard features

- Top strip with realized, latent, and total PnL, return vs baseline, Sharpe, max drawdown, trading uptime, win rate, and CAGR.
- Realized PnL panel with a single USDC curve, percent return summary, and entry/close markers.
- Live `HYPE` 1m chart with auto-zoom cycling, fill markers, avg-entry line, and live candle updates.
- Position panel with size, notional, avg entry, mark, unrealized PnL, and exposure.
- Orders panel with aggregate opens / DCAs / closes, total trading volume, current funding APR, and total funding since start.
- Action feed that groups burst fills and highlights wins, losses, buys, sells, and order events.
- Health footer with backend / browser / Lighter WS status, stale-data banner, current time, and AWS Tokyo -> Lighter RTT.
- Overlay animations for entry, win, loss, order activity, and a "this is fine" crisis animation when unrealized PnL drops below `-$10`.

## Stack

- Backend: Python 3.10+, FastAPI, asyncssh, aiosqlite, httpx, websockets, Pydantic v2
- Frontend: React 18, TypeScript, Vite, Zustand, Framer Motion, TradingView Lightweight Charts, Tailwind
- Persistence: SQLite at `data/dashboard.db` (gitignored)
- Docker: one production container serves the built frontend, API, WebSocket, and local SQLite DB.

More detail lives in [`docs/DISCOVERY.md`](docs/DISCOVERY.md), [`docs/STREAMING.md`](docs/STREAMING.md), and [`LIGHTER_DASHBOARD_PLAN.md`](LIGHTER_DASHBOARD_PLAN.md).

## Safe setup

1. Copy `.env.example` to `.env`.
2. Fill in your own `VPS_HOST`, `VPS_USER`, `SSH_KEY_PATH`, and `REMOTE_DIR`.
3. Keep `.env`, YouTube stream keys, private SSH keys, and SQLite files out of git.

Shared defaults in the tracked files are intentionally placeholders so the repo can be pushed safely.

## First-time setup

```bash
# backend
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"    # Windows
# .venv/bin/python -m pip install -e ".[dev]"      # macOS / Linux

# frontend
cd ../frontend
npm install
cd ..
```

## Run with Docker

Docker packages the dashboard only. The trading bot stays on the remote VPS, and the container connects outward to it over SSH.

```bash
docker compose up --build
```

Then open:

- Dashboard: `http://127.0.0.1:8787/`
- Stream mode: `http://127.0.0.1:8787/stream`

The compose file:

- mounts the host SSH directory read-only at `/run/secrets`;
- stores SQLite in a persistent Docker volume at `/data/dashboard.db`;
- binds the backend to `0.0.0.0:8787`;
- serves the built Vite app from the FastAPI process.

By default the API starts even if SSH is temporarily unreachable, and the collectors keep retrying in the background. Set `REQUIRE_SSH_ON_START=true` if you want container startup to wait for SSH. Docker expects the key at `/run/secrets/lighter.pem`, which maps to `./infos/lighter.pem` by default; set `HOST_SSH_DIR` in `.env` if your key lives in another host directory.

If the remote Passivbot process is not running yet, the dashboard still serves normally. It will show live Lighter market data but no fill-derived bot state until the remote cache and health log files appear.

Set the fixed dashboard starting capital once after the container is running. Use a trusted account snapshot or your own accounting source, then store that value manually:

```bash
docker compose exec dashboard python -m app.tools.starting_capital set <starting-capital-usdc> --note "manual starting capital"
```

This value is stored in the persistent SQLite volume and is not refreshed automatically from live balance changes or remote bot restarts. If no manual value has been stored yet, the app falls back to the generic configured placeholder. To inspect the current stored/effective value, run:

```bash
docker compose exec dashboard python -m app.tools.starting_capital show
```

### Remote bot running in Docker

The expected bot root is:

```text
/home/ubuntu/passivbot_lighter
```

If that path is a bind-mounted host folder on the VPS, leave `REMOTE_DOCKER_CONTAINER` empty. The dashboard will keep reading `/home/ubuntu/passivbot_lighter/caches/lighter/lighter_01_pnls.json` and `/home/ubuntu/passivbot_lighter/logs/passivbot_debug.log` over SSH.

If those files exist only inside the remote bot container, set:

```dotenv
REMOTE_DIR=/home/ubuntu/passivbot_lighter
REMOTE_DOCKER_CONTAINER=<remote-passivbot-container-name>
```

In that mode the dashboard still connects to the VPS over SSH, but file reads run through `docker exec <container> sh -lc ...` on the VPS. The SSH user must be allowed to run `docker exec`. Keep the remote container name stable across restarts; if the bot container is stopped or restarting, reads fail temporarily, the dashboard keeps serving, and the collectors recover on the next successful poll.

After a remote bot restart, the PnL cache may be empty until new fills appear. The dashboard SQLite volume keeps previously ingested fills unless you remove the `dashboard-data` volume.

## Run locally

Run the services in two terminals:

```bash
# terminal 1
cd backend
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8787
```

```bash
# terminal 2
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Then open:

- Dashboard: `http://127.0.0.1:5173/`
- Stream mode: `http://127.0.0.1:5173/stream`

If you prefer the helper script and have a bash-compatible shell available, you can also run `bash scripts/run_dev.sh`.

## Dev animation demo

Set `ENABLE_DEV_ROUTES=true` in `.env` before starting the backend. With the backend running, you can trigger demo events:

```bash
curl -X POST http://127.0.0.1:8787/api/dev/inject -H "Content-Type: application/json" -d "{\"kind\":\"win\",\"pnl\":1.23}"
curl -X POST http://127.0.0.1:8787/api/dev/inject -H "Content-Type: application/json" -d "{\"kind\":\"loss\",\"pnl\":0.75}"
curl -X POST http://127.0.0.1:8787/api/dev/inject -H "Content-Type: application/json" -d "{\"kind\":\"entry\"}"
curl -X POST http://127.0.0.1:8787/api/dev/inject -H "Content-Type: application/json" -d "{\"kind\":\"order\"}"
```

The crisis overlay is not triggered by the dev endpoint; it appears automatically when the live unrealized PnL crosses the configured drawdown threshold.

## Build and checks

```bash
# frontend
cd frontend
npm run build

# backend
cd ../backend
.venv/Scripts/python -m pytest tests -v

# Docker image
cd ..
docker compose build
```

## 24/7 stream notes

- `/stream` is the fixed `1920x1080` layout intended for OBS window capture.
- In Docker, use `http://127.0.0.1:8787/stream`; in local Vite dev, use `http://127.0.0.1:5173/stream`.
- `scripts/run_stream.ps1` launches a kiosk-style Chrome window for the stream view.
- See [`docs/STREAMING.md`](docs/STREAMING.md) for the OBS and YouTube workflow.

## Repo layout

```text
STREAMING_LIVE_PASSIBOT/
|- backend/      FastAPI app, collectors, metrics, persistence, tests
|- frontend/     React app, stream route, panels, animations
|- data/         SQLite db and captured fixtures
|- docs/         discovery and streaming notes
|- scripts/      local run, stream, discovery, and utility scripts
|- infos/        local helper files and gitignored private SSH material
|- Dockerfile    portable production build
|- docker-compose.yml  local Docker runtime with persistent SQLite + SSH directory mount
|- screen.png    screenshot used in this README
```
