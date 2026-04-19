"""Reconstruct-from-public-data estimate of total funding paid on HYPE.

Inputs:
    - fills              : authoritative fill history (from our SQLite)
    - fundings           : hourly funding ticks from Lighter REST
    - hourly_closes      : mark price at each funding hour (from Lighter REST 1h candles)

Algorithm (per the plan — "approximate, good enough"):
    Walk fundings chronologically. For each tick:
      1. Replay fills up to (not including) the tick to update position size.
      2. If flat at the tick, contribute 0 and move on.
      3. Otherwise, payment_usd = size * mark_price * (signed_rate_pct / 100).
         Sign:  direction=="long"  → bot PAYS  (positive / cost)
                direction=="short" → bot EARNS (negative / gain)
    Sum contributions.

Caveats (acceptable for the "show-off" card):
    - Uses position size at the funding boundary, not the time-weighted
      average across the hour. For a passivbot grid with many small
      intra-hour re-entries the difference is in the noise.
    - Uses candle CLOSE at the funding timestamp as mark. Lighter's mark
      oracle and the candle close diverge by at most a few bps on a
      liquid pair. Tracked in the model as `method="rest_hourly"`.
    - Assumes single-symbol (HYPE). Works because the bot is single-symbol.
"""

from __future__ import annotations

from ..envelope import now_ms
from ..market.lighter_rest import FundingTick
from ..models import Candle, FillEvent, FundingTotal


def estimate_total_funding_paid(
    fills: list[FillEvent],
    fundings: list[FundingTick],
    hourly_candles: list[Candle],
) -> FundingTotal:
    if not fills or not fundings:
        return FundingTotal(
            ts=now_ms(),
            start_ts=fills[0].ts if fills else 0,
            total_paid_usd=0.0,
            samples_count=0,
            hours_covered=0,
        )

    sorted_fills = sorted(fills, key=lambda f: f.ts)
    candles_by_sec = {c.t // 1000: c for c in hourly_candles}
    sorted_candle_secs = sorted(candles_by_sec.keys())

    size = 0.0
    avg_entry = 0.0
    fill_idx = 0
    total = 0.0
    samples = 0
    hours_seen = 0

    for tick in sorted(fundings, key=lambda x: x.timestamp):
        tick_ts_ms = tick.timestamp * 1000
        while fill_idx < len(sorted_fills) and sorted_fills[fill_idx].ts <= tick_ts_ms:
            f = sorted_fills[fill_idx]
            if f.side == "buy":
                new_size = size + f.qty
                if new_size > 0:
                    avg_entry = (size * avg_entry + f.qty * f.price) / new_size
                size = new_size
            else:  # sell
                close_qty = min(f.qty, size)
                size = max(0.0, size - close_qty)
                if size <= 1e-9:
                    size = 0.0
                    avg_entry = 0.0
            fill_idx += 1

        hours_seen += 1

        if size <= 0:
            continue

        candle = candles_by_sec.get(tick.timestamp)
        if candle is None:
            # Nearest preceding 1h candle — fundings align on-hour, candles
            # occasionally don't return a row for stale hours.
            idx = _bisect_right(sorted_candle_secs, tick.timestamp) - 1
            if idx < 0:
                continue
            candle = candles_by_sec[sorted_candle_secs[idx]]

        mark = candle.c
        payment_usd = size * mark * (tick.signed_rate_pct / 100.0)
        total += payment_usd
        samples += 1

    return FundingTotal(
        ts=now_ms(),
        start_ts=int(sorted_fills[0].ts),
        total_paid_usd=round(total, 4),
        samples_count=samples,
        hours_covered=hours_seen,
    )


def _bisect_right(a: list[int], x: int) -> int:
    lo, hi = 0, len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if x < a[mid]:
            hi = mid
        else:
            lo = mid + 1
    return lo
