"""Drawdown, Sharpe, exposure — computed from mark-to-market equity curve."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class DrawdownStats:
    max_drawdown: float          # dollar terms
    max_drawdown_pct: float      # percent of peak equity


def drawdown(equity_series: list[tuple[int, float]]) -> DrawdownStats:
    """equity_series: [(ts_ms, equity_dollars), ...] in chronological order."""
    if not equity_series:
        return DrawdownStats(0.0, 0.0)
    peak = equity_series[0][1]
    max_dd = 0.0
    max_dd_pct = 0.0
    for _ts, eq in equity_series:
        peak = max(peak, eq)
        dd = eq - peak
        if dd < max_dd:
            max_dd = dd
            if peak > 0:
                max_dd_pct = (dd / peak) * 100
    return DrawdownStats(max_drawdown=max_dd, max_drawdown_pct=max_dd_pct)


def _resample_step(
    equity_series: list[tuple[int, float]],
    *,
    interval_ms: int,
) -> list[tuple[int, float]]:
    """Resample an irregular (ts_ms, equity) series onto a fixed grid using
    left-continuous step interpolation — the equity value used at bucket
    time `t` is the last observed equity <= `t`. Works for raw fill events."""
    if not equity_series:
        return []
    series = sorted(equity_series, key=lambda x: x[0])
    start = series[0][0]
    end = series[-1][0]
    if end <= start:
        return list(series)
    out: list[tuple[int, float]] = []
    bucket = start
    idx = 0
    last_eq = series[0][1]
    while bucket <= end:
        while idx < len(series) and series[idx][0] <= bucket:
            last_eq = series[idx][1]
            idx += 1
        out.append((bucket, last_eq))
        bucket += interval_ms
    return out


def sharpe_from_equity(
    equity_series: list[tuple[int, float]],
    *,
    interval_seconds: int = 300,  # 5-minute sampling
    risk_free_rate: float = 0.0,
) -> float:
    """Annualized Sharpe ratio from the equity curve, resampled onto a
    fixed `interval_seconds` grid. Returns 0.0 when there aren't enough
    samples or stddev is 0."""
    if len(equity_series) < 3:
        return 0.0
    grid = _resample_step(equity_series, interval_ms=interval_seconds * 1000)
    eqs = [e for _, e in grid if e > 0]
    if len(eqs) < 3:
        return 0.0
    log_returns = [math.log(eqs[i] / eqs[i - 1]) for i in range(1, len(eqs))]
    if not log_returns:
        return 0.0
    mean_r = sum(log_returns) / len(log_returns)
    var = sum((r - mean_r) ** 2 for r in log_returns) / (len(log_returns) - 1)
    sd = math.sqrt(var)
    if sd == 0:
        return 0.0
    periods_per_year = (365.25 * 86400) / interval_seconds
    return (mean_r - risk_free_rate / periods_per_year) / sd * math.sqrt(periods_per_year)


def exposure_pct(position_value_usd: float, equity_usd: float) -> float:
    if equity_usd <= 0:
        return 0.0
    return (position_value_usd / equity_usd) * 100
