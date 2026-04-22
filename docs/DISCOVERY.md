# Phase 0 - Discovery

Redacted summary of the data sources available to the dashboard.
The original exploration was verified on `2026-04-19` against a live VPS, but
infrastructure-specific identifiers have been removed from this shared copy.

## VPS summary

| Item | Value |
|---|---|
| Host | `<set via VPS_HOST in .env>` |
| User | `ubuntu` |
| Remote dir | `/home/ubuntu/passivbot_lighter` |
| Hostname | redacted |
| Running bots | two HYPE long-only bot configs were active at discovery time |
| Bot logging | `logs/passivbot_debug.log*` is the useful rotating log source |

## Cache files

Listed under `/home/ubuntu/passivbot_lighter/caches/`.

| Path | Purpose | Update cadence |
|---|---|---|
| `lighter/lighter_01_pnls.json` | authoritative HYPE fill history | on each fill |
| `lighter/market_metadata.json` | market specs for Lighter markets | regular refresh |
| `lighter/coin_to_symbol_map.json` | Lighter symbol mapping | regular refresh |
| `symbol_to_coin_map.json` | cross-exchange symbol mapping | regular refresh |
| `*/markets.json` | other exchange metadata, not needed here | mostly static |
| `hlcvs_data/*/hlcvs.npy.gz` | backtest historical data, not needed live | static |

Critical finding: only `lighter_01_pnls.json` updates during live trading. The
bot does not expose separate live files for open orders, positions, or balance.

## Fill record shape

`lighter_01_pnls.json` is an array of JSON objects like:

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

- `timestamp` is milliseconds since Unix epoch.
- `pnl` is populated for sell fills and `0.0` on buys.
- `id` behaves like an exchange-side sequence id.
- Same `id` can appear more than once, so dedupe must use a fuller fingerprint.

## Log heartbeat

The dashboard-relevant log line is the periodic `[health]` summary in
`logs/passivbot_debug.log`, which includes:

- bot uptime
- position counts
- live balance
- aggregate order activity
- reconnect / error / rate limit counters

This is the source for the Orders aggregate card and several footer metrics.

## Open-orders gap

The bot does not persist individual open-order snapshots to disk. For the
dashboard this means:

1. v1 uses an aggregate orders card derived from the `[health]` line.
2. A precise per-order panel would require bot-side cooperation or separate
   reconstruction logic.

## Lighter public WebSocket

| Item | Value |
|---|---|
| URL | `wss://mainnet.zklighter.elliot.ai/stream` |
| Subscribe shape | `{"type": "subscribe", "channel": "<channel>"}` |
| Connected ack | `{"session_id": "...", "type": "connected"}` |
| Subscribe ack | `{"channel": "<channel>", "type": "subscribed/<channel_prefix>"}` |

Channels used by the dashboard:

- `ticker/{market_id}` for live best-bid / best-ask driven mark-price updates
- `order_book/{market_id}` as optional depth context

Authenticated account channels exist but are intentionally out of scope for the
dashboard process.

## Lighter REST API

| Item | Value |
|---|---|
| Base URL | `https://mainnet.zklighter.elliot.ai` |
| Candles endpoint | `GET /api/v1/candles?...` |

REST is used for candle bootstrap and reconnect gap fill. Live updates come
from the ticker WebSocket stream.

## Metric source of truth

| Metric | Source |
|---|---|
| Fill history | `caches/lighter/lighter_01_pnls.json` |
| Realized PnL total | sum of fill `pnl` or reconstructed parity check |
| Unrealized PnL | `(mark - avg_entry) * position_size` |
| Current position | reconstructed from fills |
| Live balance | `[health]` log line |
| Open orders | aggregate only from `[health]` |
| Candle bootstrap | REST `/api/v1/candles` |
| Live mark price | WS `ticker/{market_id}` |
| Bot health | `[health]` log line |

## Implementation impact

- No dedicated candle synthesis module is needed because Lighter REST already
  provides 1-minute candles.
- The collector needs both cache polling and log tailing.
- The open-orders display is intentionally aggregate-only in v1.

## Fixtures captured

The repo includes sample fixtures under `data/fixtures/` for replay tests:

- `hype_pnls.sample.json`
- `lighter_market_metadata.sample.json`
- `lighter_coin_to_symbol.sample.json`
- `lighter_candles_1m_2d.sample.json`
- `lighter_ws_snapshot.sample.json`
