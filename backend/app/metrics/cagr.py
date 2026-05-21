"""CAGR with the plan's <1yr projected / >=1yr blended branch."""

from __future__ import annotations

from dataclasses import dataclass

YEAR_DAYS = 365.25
MAX_CAGR_PCT = 1_000_000.0


@dataclass(frozen=True)
class CagrResult:
    cagr: float                  # percent
    label: str                   # "projected" | "blended"
    projected: float             # percent (always computed)
    trailing_year: float | None  # percent, only when >= 1 year of history


def _projected_cagr(total_return_pct: float, period_days: float) -> float:
    if period_days <= 0:
        return 0.0
    growth = 1 + (total_return_pct / 100.0)
    if growth <= 0:
        return -100.0
    try:
        projected = (growth ** (YEAR_DAYS / period_days) - 1) * 100
    except OverflowError:
        return MAX_CAGR_PCT
    return min(projected, MAX_CAGR_PCT)


def _trailing_year_cagr(last_year_return_pct: float) -> float:
    # Already a 1-year return; expressed as %.
    return last_year_return_pct


def compute_cagr(
    *,
    total_return_pct: float,
    period_days: float,
    last_year_return_pct: float | None,
) -> CagrResult:
    projected = _projected_cagr(total_return_pct, period_days)
    if period_days < YEAR_DAYS or last_year_return_pct is None:
        return CagrResult(cagr=projected, label="projected", projected=projected, trailing_year=None)
    trailing = _trailing_year_cagr(last_year_return_pct)
    blended = (projected + trailing) / 2
    return CagrResult(cagr=blended, label="blended", projected=projected, trailing_year=trailing)
