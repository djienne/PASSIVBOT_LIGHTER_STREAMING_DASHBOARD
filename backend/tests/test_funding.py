from __future__ import annotations

import pytest

from app.market.lighter_ws import annualize_hourly_funding_rate_pct


def test_annualize_hourly_funding_rate_pct():
    # Lighter funding payments occur hourly, so annualized APR is hourly % * 24 * 365.25.
    assert annualize_hourly_funding_rate_pct(0.01) == pytest.approx(87.66, abs=1e-6)
    assert annualize_hourly_funding_rate_pct(-0.01) == pytest.approx(-87.66, abs=1e-6)
