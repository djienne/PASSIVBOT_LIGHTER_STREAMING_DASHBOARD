from __future__ import annotations

import pytest

from app.metrics.engine import compute_snapshot
from app.models import MetricsSnapshot
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
    await repos.save_metrics(_snap(1_000, 0.0))
    await repos.save_metrics(_snap(2_000, -100.0))
    await repos.save_metrics(_snap(3_000, -50.0))
    await repos.commit()

    snap = await compute_snapshot()

    assert snap.max_drawdown == pytest.approx(-100.0)
    assert snap.max_drawdown_pct == pytest.approx(-12.5)
