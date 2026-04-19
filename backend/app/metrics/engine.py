"""Metrics engine.

Driven by a 5-minute equity sampler + event-triggered recomputes (on fill,
new candle, position update, balance update). Publishes `metrics.update`
events on the bus when the snapshot changes materially.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from ..config import settings
from ..envelope import now_ms
from ..events.bus import bus
from ..logging import log
from ..models import MetricsSnapshot
from ..persistence import repos
from .cagr import compute_cagr
from .pnl import current_position_from_fills, reconstruct_pnl_from_fills
from .risk import drawdown, exposure_pct, sharpe_from_equity


@dataclass
class _MarketRef:
    mark_price: float = 0.0


market = _MarketRef()


async def on_ticker(price: float) -> None:
    market.mark_price = price


async def compute_snapshot() -> MetricsSnapshot:
    fills = await repos.all_fills()
    # Prefer recorded pnl; fall back to reconstruction when all zeros (Lighter quirk).
    if fills and all(f.pnl == 0 for f in fills):
        fills = reconstruct_pnl_from_fills(fills)

    baseline = settings.display_baseline
    realized = sum(f.pnl for f in fills)

    pos = current_position_from_fills(fills)
    mark = market.mark_price or (fills[-1].price if fills else 0.0)
    unrealized = pos.size * (mark - pos.avg_entry) if pos.size > 0 else 0.0

    total_pnl = realized + unrealized
    equity = baseline + total_pnl
    return_pct = (total_pnl / baseline) * 100 if baseline > 0 else 0.0

    # Equity curve for drawdown / Sharpe — sample cumulative realized PnL over time
    # plus current unrealized.
    curve: list[tuple[int, float]] = []
    cum = 0.0
    for f in fills:
        cum += f.pnl
        curve.append((f.ts, baseline + cum))
    if curve:
        curve.append((now_ms(), baseline + cum + unrealized))

    dd = drawdown(curve)
    sharpe = sharpe_from_equity(curve, interval_seconds=300) if curve else 0.0

    closes = [f for f in fills if f.pnl != 0]
    wins = [f.pnl for f in closes if f.pnl > 0]
    losses = [f.pnl for f in closes if f.pnl < 0]
    win_rate = (len(wins) / len(closes) * 100) if closes else 0.0
    avg_win = sum(wins) / len(wins) if wins else 0.0
    avg_loss = sum(losses) / len(losses) if losses else 0.0
    largest_win = max(wins) if wins else 0.0
    largest_loss = min(losses) if losses else 0.0

    ts_now = now_ms()
    if fills:
        period_ms = ts_now - min(f.ts for f in fills)
        period_days = period_ms / 86_400_000
        last_trade_days = (ts_now - max(f.ts for f in fills)) / 86_400_000
    else:
        period_days = 0.0
        last_trade_days = 0.0

    cagr = compute_cagr(
        total_return_pct=return_pct,
        period_days=period_days,
        last_year_return_pct=None,  # extended when history >= 1y
    )

    pos_value = pos.size * mark
    exp = exposure_pct(pos_value, equity)

    snap = MetricsSnapshot(
        ts=ts_now,
        baseline=baseline,
        realized_pnl=realized,
        unrealized_pnl=unrealized,
        total_pnl=total_pnl,
        return_pct=return_pct,
        max_drawdown=dd.max_drawdown,
        max_drawdown_pct=dd.max_drawdown_pct,
        sharpe=sharpe,
        win_rate=win_rate,
        avg_win=avg_win,
        avg_loss=avg_loss,
        largest_win=largest_win,
        largest_loss=largest_loss,
        exposure_pct=exp,
        days_since_first_trade=period_days,
        days_since_last_trade=last_trade_days,
        cagr=cagr.cagr,
        cagr_label=cagr.label,
    )
    return snap


async def metrics_loop() -> None:
    """5-minute sampler — recompute & publish on a cadence."""
    log.info("metrics_loop: starting")
    while True:
        try:
            snap = await compute_snapshot()
            await repos.save_metrics(snap)
            await repos.commit()
            await bus.publish("metrics.update", snap)
        except Exception as exc:  # noqa: BLE001
            log.error("metrics_loop: error", error=str(exc))
        await asyncio.sleep(300)
