# Lighter Trading Bot Visualization Plan

> Historical note: this document captures the original planning pass. The
> current implementation has Docker packaging, manual starting-capital storage,
> live Lighter market data, and a production FastAPI-served frontend. Treat
> `README.md` as the current operator guide.

## Goal

Build a polished browser dashboard for the live Lighter bot trading `HYPE`, suitable for local testing now and later for 24/7 display on a dedicated streaming PC.

The dashboard should show:

- A live candlestick chart for roughly the last 2 days.
- Current and historical positions, entries, exits, fills, and open orders.
- A side panel with the latest bot actions in chronological order.
- Live strategy performance and risk metrics.
- Visual animations for opens and closes, with different behavior for wins and losses.
- A broadcast-friendly, aesthetically pleasing interface.

Current return-calculation policy:

- Starting capital is a fixed value stored manually through the dashboard CLI.
- Public defaults are placeholders; the real value should not be committed.

## Scope Assumptions

- The dashboard is for one symbol only: `HYPE`.
- Multi-symbol support is not a goal for this project.
- Starting capital is the display baseline for returns and headline metrics.
- The display baseline should be treated as operator-provided accounting context, not an audited exchange balance.
- The action history side panel should show newest events first.
- The side panel should retain roughly the last `10` events by default.

## Current Context

The current workspace is essentially greenfield. The only existing files are:

- `infos/plot_passivbot.py`
- `infos/backup_passivbot_lighter.py`
- `infos/lighter.pem`

From those files, we already know:

- The bot runs on a VPS.
- The main remote folder is `/home/ubuntu/passivbot_lighter`.
- There should be a `caches` directory on the remote host containing trading data.

## High-Level Architecture

Recommended architecture:

```text
VPS cache files + optional bot heartbeat
                |
       local collector / relay
     (SSH/SFTP polling every 2-5s)
                |
     exchange market websocket client
      (candles / mark price / ticker)
                |
      normalization + metrics engine
                |
      local backend API + websocket
                |
    browser dashboard for monitoring/streaming
```

## Main Product Requirements

### 1. Live charting

- Show candlesticks for `HYPE`.
- Default range: last 2 days.
- Update approximately every 5 seconds or better.
- Prefer exchange/public websocket feeds for candles and price.
- Overlay:
  - entry markers
  - exit markers
  - partial close markers
  - open order markers
  - average entry line
  - current position zone

### 2. Live bot state

- Current position side and size.
- Average entry.
- Current mark or last traded price.
- Open orders and their prices/sizes.
- Unrealized PnL.
- Realized PnL.
- Exposure relative to capital.

### 3. Performance metrics

- Total PnL in `$`.
- Total PnL in `%` of manually stored starting capital.
- Sharpe ratio.
- Max drawdown.
- Days since last trade.
- Days since first trade.
- Projected CAGR if track record is less than 1 year.
- If history is at least 1 year:
  - trailing 1-year realized CAGR
  - current projected CAGR
  - blended CAGR using the average of those two

### 3A. Metric definitions and data policy

- Headline return `%` should be computed against the fixed manually stored starting capital.
- The dashboard should show realized and unrealized PnL separately whenever possible, plus a combined live total.
- Max drawdown should be based on mark-to-market equity, not realized PnL alone.
- Mark-to-market equity should be defined as:
  - `display baseline + realized PnL + unrealized PnL`
- Sharpe ratio should be computed from periodic mark-to-market equity returns.
- Recommended default Sharpe definition:
  - sample equity at a fixed interval
  - use `0%` risk-free rate
  - annualize consistently from that interval
- Days since first trade and days since last trade should be based on fill history, not order placement.
- If source data is incomplete, any reconstructed metric should be clearly labeled internally as derived from fills and snapshots.

Recommended initial implementation choices:

- Internal equity sampling interval: `5 minutes`
- Risk-free rate for Sharpe: `0%`
- Use UTC for all metric calculations and durations

### 4. Event animations

- New position opened: distinct entry animation.
- Trade closed with profit: positive close animation.
- Trade closed with loss: negative close animation.
- New order placed or canceled: more subtle animation.
- Animations should feel intentional, not distracting.

### 5. Action history side panel

- A dedicated side panel should show the latest bot actions in reverse chronological order.
- Examples:
  - buy
  - sell
  - entry filled
  - partial fill
  - close filled
  - order placed
  - order canceled
  - position opened
  - position closed
- Each row should include:
  - timestamp
  - action type
  - side
  - price
  - size
  - realized PnL when relevant
  - small visual cue for win/loss/neutral
- The panel should update live and keep a recent rolling history.
- Default visible retention should be the latest `10` events.
- It should remain readable on stream, even when many events happen close together.

### 6. Aesthetic and streaming quality

- The UI should look good both as a local dashboard and as a YouTube stream scene.
- Strong visual hierarchy.
- Good contrast.
- Clear green/red semantics for gains and losses.
- Readable from a distance.
- Smooth updates without jitter.

## Recommended Technical Stack

### Backend

- Python
- `FastAPI` for REST + websocket delivery to the browser
- `asyncio` for concurrent collectors and exchange streams
- `SQLite` for local event/state persistence and restart recovery

### Frontend

- `React`
- `Vite`
- `TradingView Lightweight Charts` for candlesticks and overlays

### Data transport

- Websocket from backend to browser
- Exchange websocket for public market data whenever available
- SSH/SFTP polling for private bot cache data from the VPS

## Time and Timezone Policy

- All timestamps should be normalized and stored internally in `UTC`.
- All event ordering, deduplication, metrics, and durations should use UTC.
- The UI can later support a chosen display timezone, but the backend should stay UTC-based.
- During discovery, each upstream source should be tagged with:
  - original timestamp field
  - original unit
  - timezone assumption
  - normalization rule
- This is especially important for:
  - the chart
  - the action history side panel
  - days since first trade
  - days since last trade
  - stale-data detection

## Implementation Phases

## Phase 1: Remote Discovery and Data Audit

Objective: understand exactly what data exists on the VPS and how reliable it is.

Tasks:

- Inspect `/home/ubuntu/passivbot_lighter/caches`.
- Identify all relevant files for:
  - fills
  - orders
  - position state
  - realized PnL
  - balances/equity
  - bot status/heartbeat
- Capture sample payloads and timestamp formats.
- Confirm file update frequency.
- Confirm whether current PnL must be reconstructed from fills.
- Confirm whether open orders can be read directly from cache.

Deliverables:

- A schema map of all relevant cache files.
- A list of authoritative data sources per metric and visual.
- A decision on which fields need reconstruction or derivation.

Risks:

- Lighter data may be incomplete or inconsistent.
- Realized PnL may need reconstruction from fills.
- Some useful state may only exist transiently in memory rather than in cache.

## Phase 2: Canonical Data Model

Objective: isolate the UI from raw cache file structure.

Define normalized internal models such as:

- `Candle`
- `OrderSnapshot`
- `FillEvent`
- `PositionSnapshot`
- `StrategyMetricsSnapshot`
- `BotHealthSnapshot`
- `TimelineEvent`

Each model should include:

- canonical timestamp
- symbol
- stable identifiers where possible
- fields needed by UI and metrics engine

The `TimelineEvent` model should explicitly support the side action panel and cover:

- order placement
- order cancel
- fill
- partial close
- full close
- position open
- position close
- reconnect and warning events

It should also include:

- a stable event ID
- a display label for the side panel
- a category such as `trade`, `order`, `position`, or `system`
- a win/loss/neutral visual status when applicable

## Phase 2A: Event Reconciliation and Idempotency

Objective: guarantee that live updates remain correct through polling, reconnects, and partial failures.

Requirements:

- Every normalized event should have a stable unique identifier.
- Prefer exchange or bot-native IDs when available.
- If native IDs are missing, derive a deterministic fingerprint from source fields.
- Collector updates must be idempotent.
- Duplicate fills, repeated order snapshots, and replayed cache rows must not create duplicate UI events.
- Snapshot-based state such as open orders and current position should support versioning or freshness timestamps.
- Reconnect behavior should include:
  - a targeted backfill window
  - deduplication against already stored events
  - state resynchronization for open orders and current position
- The action history side panel should be driven from normalized deduplicated timeline events, not raw file rows.

Deliverables:

- Event ID strategy
- Deduplication rules
- Backfill and reconnect policy
- Snapshot freshness policy

Deliverables:

- A documented internal schema for all backend-to-frontend payloads.
- Clear separation between raw data ingestion and normalized app state.

## Phase 3: Collector and Relay Service

Objective: build a local service that gathers bot state from the VPS.

Tasks:

- Connect to the VPS using the existing SSH credentials.
- Poll relevant cache files every `2-5s`.
- Detect file changes efficiently.
- Parse raw data into normalized snapshots/events.
- Handle reconnects and partial failures gracefully.
- Expose collector health internally.

Design notes:

- The browser must never access the VPS key directly.
- The collector should run locally near the dashboard.
- The collector should cache recent data locally for fast restart.

Deliverables:

- Working collector process.
- Incremental parsing strategy.
- Health indicators for connectivity and freshness.

## Phase 4: Exchange Market Data Integration

Objective: provide low-latency market context for the chart.

Tasks:

- Connect to the Lighter or Hype public market websocket if available.
- Subscribe to:
  - candles
  - mark price or last price
  - optional ticker data
- Fall back to polling only where a websocket feed is unavailable.

Deliverables:

- Live candles.
- Current price feed.
- Time-synced market updates usable by the chart.

Risks:

- We must verify exact websocket support and payload shape.
- If direct candle websocket support is limited, we may need to synthesize candles from trades or poll candles periodically.

## Phase 5: Local Persistence Layer

Objective: avoid losing short-term history when the app restarts.

Tasks:

- Store normalized events and snapshots in `SQLite`.
- Retain at least the recent chart and event history.
- Support warm startup without waiting for a full reload from the VPS.
- Keep a rolling retention window for performance.

Recommended retained data:

- recent candles
- fills and closes
- order events
- position snapshots
- metrics snapshots
- bot health snapshots

Deliverables:

- Local database schema.
- Startup restoration flow.
- Retention/cleanup policy.

## Phase 5A: Replay and Verification

Objective: verify collector logic and metrics before investing heavily in UI polish.

Tasks:

- Save representative cache samples from the VPS.
- Replay captured samples through the collector and metrics pipeline.
- Compare reconstructed PnL and drawdown outputs against `infos/plot_passivbot.py`.
- Verify that reconnect replay does not duplicate action history events.
- Verify that the newest-first side panel ordering behaves correctly with delayed or out-of-order events.
- Verify that a cold restart restores the last 2 days of chart and side-panel context correctly.

Deliverables:

- Sample replay dataset
- Verification checklist
- Known discrepancies log

## Phase 6: Metrics Engine

Objective: compute all requested and derived performance indicators.

Metrics to implement:

- Total realized PnL
- Total unrealized PnL
- Total combined equity change
- Return on capital in `%`
- Sharpe ratio
- Max drawdown
- Win rate
- Average win
- Average loss
- Largest win
- Largest loss
- Days since first trade
- Days since last trade
- Current streak
- Exposure as `%` of capital
- CAGR logic requested by the project

Special CAGR rule:

- Show projected CAGR from the first fill using fractional days.
- The label should communicate that it is projected/annualized, not realized.
- Extremely large early-period projections should be capped in the UI.

Important implementation detail:

- If realized PnL is not reliable from source data, reconstruct it from fills using entry price, exit price, and closed quantity logic.

Deliverables:

- A tested metrics service.
- A clear definition for each metric.
- Consistent handling of missing or partial history.

## Phase 7: Backend API Surface

Objective: create a clean interface for the frontend.

Recommended endpoints:

- `GET /api/bootstrap`
  - initial page state
  - recent candles
  - current position
  - open orders
  - latest metrics
  - recent events
- `GET /api/health`
  - service health
  - collector freshness
  - exchange connectivity
- `WS /ws`
  - incremental state updates
  - new fills/orders/closes
  - metric refreshes
  - health events

Backend behavior:

- Bootstrap once over HTTP.
- Stream deltas over websocket.
- Throttle UI updates enough to stay smooth.

Deliverables:

- Stable API contract.
- Documented payload examples.
- Versionable event delivery model.

## Phase 8: Frontend Dashboard

Objective: create the main monitoring and streaming UI.

Recommended layout:

- Top strip:
  - total PnL
  - return %
  - Sharpe
  - max drawdown
  - days since last trade
  - days since first trade
  - projected CAGR
- Center:
  - large candlestick chart
- Side panels:
  - current position summary
  - open orders
  - recent action history feed with buy/sell/order activity
- Bottom or compact footer:
  - bot health
  - VPS sync freshness
  - websocket status
  - latency and stale-data warnings

Chart overlays:

- entries
- exits
- take-profit or close markers
- order levels
- current position band
- average entry line

Deliverables:

- Main dashboard view.
- Resizable responsive layout.
- Fullscreen-friendly stream mode.
- Dedicated action history side panel optimized for live monitoring.

## Phase 9: Animation and Visual Language

Objective: make the UI feel premium and alive without becoming noisy.

Animation ideas:

- New position open:
  - brief pulse/glow around the entry marker
- Winning close:
  - green upward burst or success ripple
- Losing close:
  - red downward break or fading impact effect
- Order placement/cancel:
  - smaller accent flash

Design direction:

- Avoid generic admin-dashboard styling.
- Use a deliberate trading-desk / broadcast aesthetic.
- Prioritize legibility and calm motion over decorative clutter.

Deliverables:

- Motion system guidelines.
- Event-driven animation hooks.
- Color and typography system.

## Phase 10: Bot Health and Reliability Layer

Objective: make failures visible and manageable.

Health indicators:

- VPS reachable / unreachable
- last successful cache sync time
- exchange websocket connected / disconnected
- stale cache detection
- parser errors
- local backend status
- local persistence status

Failure handling:

- Retry with backoff.
- Keep last good state visible.
- Surface stale-data banners when needed.
- Log collector and parsing issues clearly.

Deliverables:

- Health model.
- User-visible warning states.
- Operational logging.

## Phase 11: Stream Mode and 24/7 Deployment

Objective: support later migration to a dedicated always-on PC for YouTube streaming.

Requirements:

- Auto-start backend on machine boot.
- Auto-start frontend or serve it locally.
- Automatic reconnect after transient network failure.
- Browser-friendly fullscreen route for OBS capture.
- Stable layout for long-running display sessions.

Security requirements for the always-on machine:

- Move the SSH private key out of the project folder before 24/7 deployment.
- Use a dedicated read-only key or restricted SSH access where possible.
- Prefer explicit host verification rather than permanently disabling host checks.
- Keep credentials and connection settings separate from the frontend.
- Document how the key can be rotated or revoked without changing the dashboard code.

Recommended later setup:

- One local service for backend/collector.
- One browser instance in fullscreen or kiosk mode.
- OBS scene capturing the dashboard page.

Deliverables:

- Deployment checklist.
- Process supervision approach.
- Stream mode layout.

## Nice-to-Have Enhancements

These are not mandatory for version 1 but would add value:

- Daily performance heatmap
- Realized vs unrealized PnL split card
- Equity curve mini-chart
- Time since last fill
- Time since last full close
- Connection latency indicator
- Automatic daily screenshot export
- Session-based highlights for best/worst trade of the day
- Optional sound cues for fills or closes

## Core Unknowns to Resolve Early

These should be answered before implementation starts in earnest:

1. What exact files exist under `/home/ubuntu/passivbot_lighter/caches`?
2. Which files are authoritative for fills, orders, positions, and PnL?
3. Does Lighter expose all needed public market data via websocket?
4. How often do the cache files update during live trading?
5. Are partial fills and canceled orders preserved in a readable history?
6. Do we need a tiny read-only relay process on the VPS, or is local SSH polling sufficient?

## Recommended Build Order

To reduce risk, implement in this sequence:

1. Remote discovery and schema map
2. Canonical data model
3. Event reconciliation and idempotency rules
4. Collector and normalization layer
5. Local persistence and restart recovery
6. Replay and verification harness
7. Exchange websocket integration
8. Metrics engine
9. Backend API
10. Frontend dashboard
11. Animation and stream mode
12. 24/7 deployment hardening

## Acceptance Criteria for Version 1

Version 1 should be considered successful if it can:

- Display the last ~2 days of `HYPE` candlesticks.
- Show live entries, exits, open orders, and current position.
- Show a newest-first action side panel with roughly the last `10` events.
- Update automatically without manual refresh.
- Display the requested performance metrics.
- Detect and display stale-data or disconnected states.
- Run locally on this PC for testing.
- Be straightforward to move later to a dedicated always-on streaming PC.

## Immediate Next Step

Before writing application code, the first implementation task should be:

- Inspect the VPS cache directory in detail and produce a concrete data inventory for the bot's real files and payloads.

That discovery step will determine the final backend schema, polling approach, and how much PnL/order reconstruction is required.
