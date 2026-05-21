from __future__ import annotations

import pytest

from app.metrics.cagr import compute_cagr
from app.metrics.engine import compute_snapshot, market
from app.models import FillEvent, MetricsSnapshot
from app.persistence import repos


def _snap(ts: int, total_pnl: float) -> MetricsSnapshot:
    baseline = 800.0
    return MetricsSnapshot(
        ts=ts,
        baseline=baseline,
        realized_pnl=total_pnl,
        unrealized_pnl=0.0,
        total_pnl=total_pnl,
        return_pct=(total_pnl / baseline) * 100,
        max_drawdown=min(total_pnl, 0.0),
        max_drawdown_pct=min((total_pnl / baseline) * 100, 0.0),
        sharpe=0.0,
        win_rate=0.0,
        avg_win=0.0,
        avg_loss=0.0,
        largest_win=0.0,
        largest_loss=0.0,
        exposure_pct=0.0,
        days_since_first_trade=0.0,
        days_since_last_trade=0.0,
        cagr=0.0,
        cagr_label="projected",
    )


@pytest.mark.asyncio
async def test_drawdown_uses_historical_equity_curve(tmp_db):
    async with repos.transaction():
        await repos.set_starting_capital(650.0, note="test baseline")

    await repos.save_metrics(_snap(1_000, 0.0))
    await repos.save_metrics(_snap(2_000, -100.0))
    await repos.save_metrics(_snap(3_000, -50.0))
    await repos.commit()

    snap = await compute_snapshot()

    assert snap.max_drawdown == pytest.approx(-100.0)
    assert snap.max_drawdown_pct == pytest.approx((-100.0 / 650.0) * 100)


@pytest.mark.asyncio
async def test_cagr_uses_total_pnl_including_unrealized(tmp_db):
    fills = [
        FillEvent(
            event_id="buy-1",
            ts=1_700_000_000_000,
            symbol="HYPE/USDC:USDC",
            side="buy",
            qty=1.0,
            price=100.0,
            pnl=0.0,
            position_side="long",
        ),
        FillEvent(
            event_id="sell-1",
            ts=1_700_000_600_000,
            symbol="HYPE/USDC:USDC",
            side="sell",
            qty=0.5,
            price=180.0,
            pnl=40.0,
            position_side="long",
        ),
    ]
    for fill in fills:
        await repos.insert_fill(fill, fill.model_dump())
    await repos.commit()

    previous_mark = market.mark_price
    market.mark_price = 300.0  # Leaves a large unrealized gain on the remaining 0.5 position.
    try:
        snap = await compute_snapshot()
    finally:
        market.mark_price = previous_mark

    expected = compute_cagr(
        total_return_pct=((40.0 + 100.0) / snap.baseline) * 100,
        period_days=snap.days_since_first_trade,
        last_year_return_pct=None,
    )

    assert snap.realized_pnl == pytest.approx(40.0)
    assert snap.unrealized_pnl == pytest.approx(100.0)
    assert snap.cagr == pytest.approx(expected.cagr)


@pytest.mark.asyncio
async def test_cagr_period_starts_at_first_fill(tmp_db):
    fills = [
        FillEvent(
            event_id="buy-1",
            ts=1_700_000_000_000,
            symbol="HYPE/USDC:USDC",
            side="buy",
            qty=1.0,
            price=100.0,
            pnl=0.0,
            position_side="long",
        ),
        FillEvent(
            event_id="sell-1",
            ts=1_700_086_400_000,
            symbol="HYPE/USDC:USDC",
            side="sell",
            qty=1.0,
            price=101.0,
            pnl=1.0,
            position_side="flat",
        ),
    ]
    for fill in fills:
        await repos.insert_fill(fill, fill.model_dump())
    await repos.commit()

    snap = await compute_snapshot()

    expected_period_days = (snap.ts - fills[0].ts) / 86_400_000
    expected = compute_cagr(
        total_return_pct=(snap.total_pnl / snap.baseline) * 100,
        period_days=expected_period_days,
        last_year_return_pct=None,
    )

    assert snap.days_since_first_trade == pytest.approx(expected_period_days)
    assert snap.cagr == pytest.approx(expected.cagr)
