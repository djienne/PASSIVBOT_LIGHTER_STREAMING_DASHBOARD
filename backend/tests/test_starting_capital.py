from __future__ import annotations

import pytest

from app.api.routes_http import bootstrap, pnl_curve
from app.config import settings
from app.models import FillEvent, MetricsSnapshot
from app.persistence import repos


def _metric_snap(ts: int, total_pnl: float) -> MetricsSnapshot:
    return MetricsSnapshot(
        ts=ts,
        baseline=800.0,
        realized_pnl=total_pnl,
        unrealized_pnl=0.0,
        total_pnl=total_pnl,
        return_pct=(total_pnl / 800.0) * 100,
        max_drawdown=min(total_pnl, 0.0),
        max_drawdown_pct=min((total_pnl / 800.0) * 100, 0.0),
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
async def test_starting_capital_fallback_then_manual_override(tmp_db, monkeypatch):
    monkeypatch.setattr(settings, "starting_capital_fallback", 700.0)
    monkeypatch.setattr(settings, "display_baseline", 800.0)

    fallback = await repos.resolve_starting_capital()
    assert fallback.value == pytest.approx(700.0)
    assert fallback.source == "config_fallback"

    async with repos.transaction():
        await repos.set_starting_capital(1234.56, note="manual")

    stored = await repos.resolve_starting_capital()
    assert stored.value == pytest.approx(1234.56)
    assert stored.source == "manual"
    assert stored.note == "manual"


@pytest.mark.asyncio
async def test_invalid_starting_capital_rejected(tmp_db):
    with pytest.raises(ValueError):
        await repos.set_starting_capital(0)
    with pytest.raises(ValueError):
        await repos.set_starting_capital(float("nan"))


@pytest.mark.asyncio
async def test_historical_curve_uses_current_starting_capital_not_old_snapshot_baseline(tmp_db):
    async with repos.transaction():
        await repos.set_starting_capital(1234.56, note="manual")
        await repos.save_metrics(_metric_snap(1_000, 0.0))
        await repos.save_metrics(_metric_snap(2_000, 10.0))

    curve = await repos.historical_equity_curve()
    assert [ts for ts, _ in curve] == [2_000]
    assert curve[0][1] == pytest.approx(1244.56)


@pytest.mark.asyncio
async def test_bootstrap_and_pnl_curve_return_resolved_starting_capital(tmp_db):
    async with repos.transaction():
        await repos.set_starting_capital(1234.56, note="manual")
        fill = FillEvent(
            event_id="sell-1",
            ts=1_700_000_000_000,
            symbol="HYPE/USDC:USDC",
            side="sell",
            qty=0.5,
            price=59.66,
            pnl=12.34,
            position_side="flat",
        )
        await repos.insert_fill(fill, fill.model_dump())

    boot = await bootstrap(since=None)
    assert boot["starting_capital"] == pytest.approx(1234.56)
    assert boot["baseline"] == pytest.approx(1234.56)
    assert boot["starting_capital_source"]["source"] == "manual"
    assert boot["metrics"]["baseline"] == pytest.approx(1234.56)

    curve = await pnl_curve()
    assert curve["starting_capital"] == pytest.approx(1234.56)
    assert curve["baseline"] == pytest.approx(1234.56)
    assert curve["points"][0]["pnl"] == pytest.approx(12.34)


def test_starting_capital_cli_set_show_clear(tmp_path, monkeypatch, capsys):
    from app.persistence import db as db_mod
    from app.tools import starting_capital

    db_path = tmp_path / "cli.db"
    monkeypatch.setattr(settings, "database_path", db_path)
    db_mod.db.path = db_path
    db_mod.db._conn = None

    assert starting_capital.main(["set", "1234.56", "--note", "manual"]) == 0
    assert '"value": 1234.56' in capsys.readouterr().out

    assert starting_capital.main(["show"]) == 0
    out = capsys.readouterr().out
    assert '"source": "manual"' in out
    assert '"value": 1234.56' in out

    assert starting_capital.main(["clear"]) == 0
    out = capsys.readouterr().out
    assert "stored: cleared" in out


def test_starting_capital_cli_discover_is_read_only_without_vps(tmp_path, monkeypatch, capsys):
    from app.persistence import db as db_mod
    from app.tools import starting_capital

    db_path = tmp_path / "discover.db"
    monkeypatch.setattr(settings, "database_path", db_path)
    monkeypatch.setattr(settings, "vps_host", "your-vps-host")
    db_mod.db.path = db_path
    db_mod.db._conn = None

    assert starting_capital.main(["discover", "--timeout", "0.1"]) == 0
    out = capsys.readouterr().out
    assert "VPS_HOST is not configured" in out
