from __future__ import annotations

import pytest

from app.metrics.cagr import compute_cagr


def test_projected_branch_less_than_1_year():
    r = compute_cagr(total_return_pct=10, period_days=30, last_year_return_pct=None)
    assert r.label == "projected"
    # ~10% over 30d annualized ≈ (1.10)^(365.25/30) - 1  ≈ 223%
    assert 200 < r.cagr < 260


def test_blended_branch_more_than_1_year():
    r = compute_cagr(total_return_pct=50, period_days=700, last_year_return_pct=40)
    assert r.label == "blended"
    # projected should be smaller (50% over 700d annualized) blended with trailing 40%.
    assert r.trailing_year == 40
    assert r.cagr == pytest.approx((r.projected + 40) / 2, abs=1e-6)


def test_zero_period():
    r = compute_cagr(total_return_pct=5, period_days=0, last_year_return_pct=None)
    assert r.cagr == 0.0


def test_first_hour_positive_return_is_clamped_not_overflowing():
    r = compute_cagr(total_return_pct=10, period_days=1 / 24, last_year_return_pct=None)
    assert r.label == "projected"
    assert r.cagr == 1_000_000


def test_first_hour_loss_is_finite():
    r = compute_cagr(total_return_pct=-10, period_days=1 / 24, last_year_return_pct=None)
    assert r.cagr == pytest.approx(-100.0)


def test_projected_cagr_uses_actual_period_without_minimum_window():
    r = compute_cagr(total_return_pct=1, period_days=1, last_year_return_pct=None)
    expected = ((1.01 ** 365.25) - 1) * 100
    assert r.cagr == pytest.approx(expected)


def test_negative_full_loss_caps_at_minus_100():
    r = compute_cagr(total_return_pct=-100, period_days=1 / 24, last_year_return_pct=None)
    assert r.cagr == -100.0
