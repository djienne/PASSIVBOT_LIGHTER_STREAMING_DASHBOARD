from __future__ import annotations

from app.collector.parsers import parse_fill_record, parse_health_line


def test_parse_fill_record_sample():
    raw = {
        "id": "16283723713",
        "symbol": "HYPE/USDC:USDC",
        "timestamp": 1774015215376,
        "pnl": 0.0,
        "position_side": "long",
        "side": "buy",
        "qty": 2.06,
        "price": 38.9577,
    }
    f = parse_fill_record(raw)
    assert f.event_id.startswith("lighter:16283723713:")
    assert f.ts == 1774015215376
    assert f.side == "buy"
    assert f.qty == 2.06
    assert f.price == 38.9577


def test_parse_health_line_matches_real_sample():
    line = (
        "2026-04-19T15:41:31 INFO     [lighter] [health] "
        "uptime=4.0d17.0h16.0m | positions=1 long, 0 short | balance=847.43 USDC "
        "| orders_placed=45 | orders_cancelled=23 | fills=0 | errors=0 "
        "| ws_reconnects=0 | rate_limits=0"
    )
    result = parse_health_line(line)
    assert result is not None
    health, balance, agg = result
    assert health.bot_errors == 0
    assert health.bot_uptime_seconds is not None
    assert health.bot_uptime_seconds > 0
    assert balance is not None
    assert balance.balance == 847.43
    assert agg is not None
    assert agg.orders_placed == 45
    assert agg.orders_cancelled == 23


def test_parse_health_line_ignores_unrelated():
    assert parse_health_line("2026-04-19T15:41:31 DEBUG    [lighter] < TEXT ...") is None
    assert parse_health_line("random nonsense") is None
