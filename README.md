# Lighter HYPE — Live Dashboard

Broadcast-ready dashboard for a Passivbot running on Lighter trading `HYPE`.
Local dev now, portable to a 24/7 streaming PC for OBS capture later.

## What it shows

- **Top strip** — Total PnL, Return % (vs 800 USDC baseline), Sharpe, Max Drawdown, Days Since Last Trade, Win Rate, CAGR (projected / blended).
- **Chart** — last 48h of HYPE 1m candles from Lighter REST + live ticker updates; entry/close markers, dashed avg-entry line, dotted mark line.
- **Position panel** — size, notional, avg entry, mark, unrealized PnL $/%.
- **Orders panel** — aggregate counts from the bot's `[health]` log line (placed / cancelled / approx open).
- **Action feed** — newest-first timeline of fills with per-row win/loss dot and realized PnL.
- **Health footer** — backend / WS / Lighter status; stale banner if any source falls behind.
- **Animations** — entry pulse, winning burst, losing fade, order flash, deduped across replay storms.
- **`/stream` route** — locked 1920×1080 OBS-tuned layout with no cursor or scrollbars.

## Stack

- **Backend** — Python 3.10+, FastAPI, asyncssh, aiosqlite, httpx, websockets, Pydantic v2.
- **Frontend** — React 18 + TypeScript + Vite, TradingView Lightweight Charts, Framer Motion, Zustand, Tailwind.
- **Persistence** — SQLite (`data/dashboard.db`) for candles, fills, timeline, metrics, health — with cursor-based WS resume.

Full architecture write-up: [`docs/DISCOVERY.md`](docs/DISCOVERY.md) · [`LIGHTER_DASHBOARD_PLAN.md`](LIGHTER_DASHBOARD_PLAN.md).

## First-time setup

```bash
# 1. clone / cd to repo root
cd /path/to/STREAMING_LIVE_PASSIBOT

# 2. copy the env template and edit to taste
cp .env.example .env

# 3. backend
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"    # Windows
# or  .venv/bin/python -m pip install -e ".[dev]"  # macOS/Linux
cd ..

# 4. frontend
cd frontend
npm install
cd ..
```

## Run (local dev)

```bash
bash scripts/run_dev.sh
```

Then open:
- Dashboard: http://127.0.0.1:5173/
- Stream mode: http://127.0.0.1:5173/stream

Or run them separately:

```bash
# backend  (port 8787)
cd backend && .venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8787

# frontend (port 5173)
cd frontend && npm run dev
```

## Phase 0 discovery scripts (optional)

All findings are already captured in `docs/DISCOVERY.md` and `data/fixtures/`, but you can re-run:

```bash
bash scripts/discover_cache.sh       # inventories /home/ubuntu/passivbot_lighter/caches
python scripts/probe_lighter_ws.py   # records Lighter WS subscribe/response
python scripts/snapshot_cache.py     # downloads cache JSONs into data/fixtures/
```

## Tests

```bash
cd backend
.venv/Scripts/python -m pytest tests/ -v
```

Covers: PnL reconstruction parity vs `infos/plot_passivbot.py`, LRU+fingerprint dedupe, CAGR branches (projected / blended), cache-line parser, end-to-end replay idempotency.

## Animation demo (no live trade required)

With the backend running, POST to the dev side-door:

```bash
curl -X POST http://127.0.0.1:8787/api/dev/inject \
  -H "Content-Type: application/json" -d '{"kind":"win","pnl":1.23}'
curl -X POST http://127.0.0.1:8787/api/dev/inject \
  -H "Content-Type: application/json" -d '{"kind":"loss","pnl":0.75}'
curl -X POST http://127.0.0.1:8787/api/dev/inject \
  -H "Content-Type: application/json" -d '{"kind":"entry"}'
```

Each kind triggers a different animation variant; the AnimationCoordinator dedupes if you spam.

## 24/7 stream mode (Windows)

1. Build the frontend once: `cd frontend && npm run build && npm run preview -- --host 127.0.0.1 --port 5173`
   (or serve `frontend/dist/` with any static server).
2. Register the backend as a Windows service via NSSM:
   ```powershell
   nssm install LighterDashboard "C:\...\backend\.venv\Scripts\python.exe" `
     "-m uvicorn app.main:app --host 127.0.0.1 --port 8787"
   nssm set LighterDashboard AppDirectory "C:\...\STREAMING_LIVE_PASSIBOT\backend"
   nssm set LighterDashboard Start SERVICE_AUTO_START
   Start-Service LighterDashboard
   ```
3. Launch kiosk Chrome at logon (Task Scheduler → "At logon" → PowerShell `scripts/run_stream.ps1`).

Before moving to the streaming PC, move `infos/lighter.pem` out of the repo to `%USERPROFILE%\.ssh\lighter.pem` and update `.env`'s `SSH_KEY_PATH` accordingly.

## Data flow summary

```
              Lighter VPS (passivbot)
              │
              ├── caches/lighter/lighter_01_pnls.json   (fills — polled 3s)
              └── logs/passivbot_debug.log [health]     (balance, orders — tailed)
                           │
                           ▼ asyncssh (single persistent session)
        ┌────────────────────────────────────────────┐
        │  CachePoller  +  HealthLogTail             │
        │  ↓                                         │
        │  FillEvent / TimelineEvent / Balance /     │
        │  OrderAggregate / HealthSnapshot  ──────┐  │
        │                                         │  │
        │  MetricsEngine  (5-min sampler)         │  │
        │       ↑                                 │  │
        │  LighterWS(ticker/24)  → Candles  ──────┤  │
        │  LighterREST(/api/v1/candles)           │  │
        │                                         ▼  │
        │                    EventBus (asyncio pub/sub)
        │                                         │  │
        │  FastAPI /api/bootstrap  · /ws hub ◄────┘  │
        └────────────────────────────────────────────┘
                           │
                           ▼ WebSocket envelopes
                 React + Zustand store
                 TopStrip · Chart · Panels · ActionFeed · Animations
```

## Known / by-design constraints

- **Open orders are not exposed individually.** The bot keeps them in RAM; only aggregate counts from its `[health]` line make it to disk. The Orders panel is therefore an aggregate card, not a live order list. (Fix would require cooperation from the bot.)
- **Lighter has no public candle WS.** We bootstrap 48 h via REST (paginated 500 at a time) and update the latest candle from the `ticker/24` BBO stream.
- **Single-symbol.** HYPE only. Multi-symbol was explicitly out of scope.
- **Long-only.** Matches the current `reconstruct_pnl()` logic. Short positions would need an extension to `metrics/pnl.py`.

## Layout

```
STREAMING_LIVE_PASSIBOT/
├── backend/
│   ├── app/
│   │   ├── collector/   — asyncssh poll of caches + log tail
│   │   ├── market/      — Lighter REST candles + WS ticker
│   │   ├── metrics/     — PnL reconstruction, drawdown, Sharpe, CAGR
│   │   ├── persistence/ — aiosqlite + schema + typed repos
│   │   ├── api/         — routes_http, routes_ws, routes_dev
│   │   ├── events/bus.py — in-process async pub/sub
│   │   ├── config.py    — pydantic-settings
│   │   └── main.py      — FastAPI factory + lifespan
│   └── tests/           — parity, dedupe, CAGR, parsers, replay
├── frontend/
│   └── src/
│       ├── components/  — TopStrip, ChartPanel, PositionPanel, OrdersPanel, ActionFeed, HealthFooter, anim/*
│       ├── routes/      — Dashboard, Stream
│       └── lib/         — api, ws, store (zustand), types, format
├── scripts/             — discover_cache.sh, probe_lighter_ws.py, snapshot_cache.py, run_dev.sh, run_stream.ps1, inject_event.py
├── data/
│   ├── dashboard.db     — SQLite (gitignored)
│   └── fixtures/        — captured Lighter samples for replay tests
├── docs/
│   └── DISCOVERY.md     — Phase 0 results
├── infos/               — original plot_passivbot.py + SSH key (gitignored)
└── LIGHTER_DASHBOARD_PLAN.md  — the approved plan
```
