# Phase 0 — Discovery

Authoritative inventory of data sources available to the dashboard.
All findings verified on `2026-04-19` against the live VPS.

## VPS summary

| Item | Value |
|---|---|
| Host | `54.95.246.213` |
| User | `ubuntu` |
| Remote dir | `/home/ubuntu/passivbot_lighter` |
| Hostname | `ip-172-31-3-85` |
| Running bots | two — `configs/config_hype.json` (pid 10014, since Mar 27) and `configs/hype_top.json` (pid 1102505, since Apr 14). Both HYPE long-only. |
| Bot logging | via Python logging → `logs/passivbot_debug.log*` (rotating, ~10 MB/file). `bot.log` and `monitor.log` at repo root are stale (Mar 5). |

## Cache files

Listed under `/home/ubuntu/passivbot_lighter/caches/`.

| Path | Size | mtime | Purpose | Update cadence |
|---|---:|---|---|---|
| `lighter/lighter_01_pnls.json` | 31 KB | minutes after each fill | Authoritative fill history for HYPE | on each fill |
| `lighter/market_metadata.json` | 33 KB | 2026-04-19 15:26 | Market specs (market_id, decimals, leverage, limits) for all Lighter markets | regular refresh |
| `lighter/coin_to_symbol_map.json` | 8 KB | regular refresh | `{"HYPE": ["HYPE/USDC:USDC"]}` | regular refresh |
| `symbol_to_coin_map.json` | 85 KB | 2026-04-19 15:26 | Cross-exchange symbol canonicalization (includes `"24": "HYPE"`) | regular refresh |
| `{binance,bitget,bybit,gateio,hyperliquid,okx}/markets.json` | large | static | Other-exchange metadata — **not relevant to this dashboard** | — |
| `hlcvs_data/*/hlcvs.npy.gz` | 8 MB | static | Backtest historical candle data — **not relevant live** | — |

**Critical**: only `lighter_01_pnls.json` updates during live trading. There is **no** separate open-orders file, **no** separate position-snapshot file, and **no** balance cache. The bot holds those in memory.

## Fill record shape (`lighter_01_pnls.json`)

Array of JSON objects. Example (first record):

```json
{
  "id": "16283723713",
  "symbol": "HYPE/USDC:USDC",
  "timestamp": 1774015215376,
  "pnl": 0.0,
  "position_side": "long",
  "side": "buy",
  "qty": 2.06,
  "price": 38.9577
}
```

Notes:
- `timestamp` is **milliseconds since Unix epoch**. Use `ts_unit="ms"` in pandas.
- `pnl` is populated for **sell** (close-long) fills; `0.0` on buys. The `reconstruct_pnl()` logic in `infos/plot_passivbot.py` can be used to recompute from scratch as a sanity check.
- `id` looks like an exchange-assigned sequence — use as event primary key.
- All records so far are `position_side: long`, confirming the bot is long-only for HYPE.
- Same `id` can appear twice with identical `timestamp` when a single fill closes across grid levels (see e.g. ids `16305937627` and `16305937625`) — dedupe by full fingerprint, not `id` alone.

## Log heartbeat (`logs/passivbot_debug.log`)

Most of the file is raw WS traffic (~99.99% PING/PONG + `ticker:24` frames). The one dashboard-relevant line type:

```
2026-04-19T15:41:31 INFO     [lighter] [health] uptime=4.0d17.0h16.0m | positions=1 long, 0 short | balance=847.43 USDC | orders_placed=45 | orders_cancelled=23 | fills=0 | errors=0 | ws_reconnects=0 | rate_limits=0
```

Emitted roughly every 15 minutes. Parseable as a simple `k=v | k=v …` line.

Use this for:
- **live balance** (`balance=`) — the only available equity snapshot
- **position count** (`positions=N long, M short`) — coarse confirmation
- **lifetime order activity** (`orders_placed`, `orders_cancelled`)
- **bot uptime** (`uptime=`)
- **bot health** (`errors`, `ws_reconnects`, `rate_limits`)

## Open-orders gap

The bot never logs individual order place/cancel events to the rotating debug log in DEBUG or INFO (only the aggregate counts in the health line). Options for the dashboard's "open orders" panel:

1. **Aggregate card** — show "45 placed / 23 cancelled / ~22 currently open" from the health line, no per-order rows.
2. **Grid reconstruction** — load `configs/config_hype.json`'s grid parameters + current mark price, compute the grid the bot *should* have open. Accurate to the bot's intent, not exchange truth.
3. **Ask for a tiny cooperative change on the bot** — have passivbot dump `open_orders.json` into caches periodically. Out of scope unless we are allowed to modify the bot.

**Decision:** v1 uses option 1 (aggregate card) in `OrdersPanel`, labelled as such. Option 2 can be added later as an overlay if the visuals feel thin.

## Lighter public WebSocket

| | Value |
|---|---|
| URL | `wss://mainnet.zklighter.elliot.ai/stream` |
| Subscribe shape | `{"type": "subscribe", "channel": "<channel>"}` |
| Connected ack | `{"session_id": "...", "type": "connected"}` |
| Subscribe ack | `{"channel": "<channel>", "type": "subscribed/<channel_prefix>"}` |

### Public channels (what we use)

| Channel | Yields | Expected dashboard role |
|---|---|---|
| `ticker/{market_id}` | bid/ask, last update ts, nonce — high-frequency BBO | live mark-price for chart + overlays |
| `order_book/{market_id}` | full order book depth snapshot + updates | optional — depth band on chart |

Sample `ticker/24` frame:

```json
{
  "channel": "ticker:24",
  "last_updated_at": 1776613883702020,
  "nonce": 10317430670,
  "ticker": {
    "s": "HYPE",
    "a": {"price": "43.3570", "size": "19.99"},
    "b": {"price": "43.3524", "size": "11.41"},
    "last_updated_at": 1776613883702020
  },
  "timestamp": 1776613884599,
  "type": "update/ticker"
}
```

Note the subscribe uses `ticker/24` (slash); the echoed channel label is `ticker:24` (colon).

### Authenticated channels (we do NOT use)

`account_orders/{mid}/{account_index}`, `account_all/{account_index}`, `user_stats/{account_index}` — require the bot's signer keys. We deliberately keep those out of the dashboard process.

## Lighter REST API

| | Value |
|---|---|
| Base URL | `https://mainnet.zklighter.elliot.ai` |
| Candles endpoint | `GET /api/v1/candles?market_id={mid}&resolution={1m|5m|1h|…}&start_timestamp={s}&end_timestamp={s}&count_back={N}` |

Sample response:

```json
{
  "code": 0,
  "r": "...",
  "c": [
    {"t": 1776606720000, "o": 43.6141, "h": 43.621, "l": 43.6032, "c": 43.6136, "v": 5.09, "V": 222.015, "i": 18166613510},
    ...
  ]
}
```

Fields: `t` = open time in ms, `o/h/l/c` = OHLC, `v` = base volume, `V` = quote volume, `i` = sequence id.

We use this endpoint for **chart bootstrap** (last 2 days of 1m candles) and for **gap fill** on reconnect. Live updates come from the `ticker/24` WS channel.

## HYPE market metadata (from `market_metadata.json`)

```
market_id:      24
symbol:         HYPE/USDC:USDC
base/quote:     HYPE / USDC
price_decimals: (from market_metadata — pulled at load time)
size_decimals:  (from market_metadata — pulled at load time)
```

Cross-reference sanity: `caches/symbol_to_coin_map.json` contains the mapping `"24": "HYPE"`.

## Decision table — metric → authoritative source

| Metric | Source | Notes |
|---|---|---|
| Fill history (entries, exits, partial closes) | `caches/lighter/lighter_01_pnls.json` | Poll 2–5 s, hash-compare for no-op skip |
| Realized PnL total | Sum of `pnl` field in fills (or reconstruct via `reconstruct_pnl()` if all-zero) | |
| Unrealized PnL | `(mark - avg_entry) * position_size` | Mark from ticker WS, position reconstructed from fills |
| Current position | Reconstructed from fills (long-only entry-weighted avg) | Confirmed at 15-min grain by `[health] positions=` |
| Live balance | `passivbot_debug.log` `[health]` line, tailed on the VPS | ~15-min refresh |
| Open orders (live) | **Not available** — use aggregate from `[health]` line | See Open-orders gap section |
| Chart candles (bootstrap) | REST `GET /api/v1/candles?market_id=24&resolution=1m&...` | 2-day window |
| Chart live price | WS `ticker/24` | Update candle OHLC client-side; also used as mark price |
| Bot health (uptime, reconnects, errors) | `passivbot_debug.log` `[health]` line | |

## Data-flow impact on the plan

Relative to the original plan in `LIGHTER_DASHBOARD_PLAN.md` / the approved implementation plan:

- `backend/app/market/candle_synth.py` is **no longer needed** — REST `/api/v1/candles` gives us 1m candles directly.
- `backend/app/market/lighter_ws.py` subscribes to `ticker/24` only; maintains the last candle in memory and updates its `c`, `h`, `l`, `v` on each ticker print; a new candle is rolled at each 1m boundary.
- Collector also tails `logs/passivbot_debug.log` for the `[health]` INFO line (grep + incremental `stat -c %s` offset), not just the cache JSON. This becomes a second collector source: `collector/log_tail.py`.
- Open-orders panel is an aggregate card; live per-order list is not feasible without bot cooperation.
- No need for `market/candle_synth.py`, so delete that planned module.

## Fixtures captured (in `data/fixtures/`)

- `hype_pnls.sample.json` — current fill history (31 KB, from VPS 2026-04-19)
- `lighter_market_metadata.sample.json` — market specs
- `lighter_coin_to_symbol.sample.json` — symbol map (lighter-specific)
- `lighter_candles_1m_2d.sample.json` — 500-candle slice from the REST endpoint
- `lighter_ws_snapshot.sample.json` — 80 live WS frames spanning ticker + order_book

## Open questions — resolved

1. **Are open orders / positions cached?** No. Reconstructed from fills + `[health]` line.
2. **Does Lighter expose a public candle WS?** No. Use REST for candles, ticker WS for price updates.
3. **Is realized PnL reliable in cache?** Yes — sell fills carry computed `pnl`. Keep the reconstruction path as sanity-check only.
4. **Do both bot processes write to the same pnls file?** Only `lighter_01_pnls.json` exists; both processes appear to share the Lighter account.
