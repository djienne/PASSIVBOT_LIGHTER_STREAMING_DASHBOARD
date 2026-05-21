from __future__ import annotations

from app.collector.parsers import parse_fill_record
from app.collector.trade_classifier import parse_symbol_units, timeline_events_from_fills


def _fill(raw_id: str, ts: int, side: str, qty: float, price: float, pnl: float = 0.0):
    return parse_fill_record({
        "id": raw_id,
        "symbol": "HYPE/USDC:USDC",
        "timestamp": ts,
        "side": side,
        "qty": qty,
        "price": price,
        "pnl": pnl,
        "position_side": "long",
    })


def _action(event):
    return event.payload["trade_action"]


def test_parse_symbol_units_for_lighter_perp_symbol():
    assert parse_symbol_units("HYPE/USDC:USDC") == ("HYPE", "USDC")


def test_classifies_entry_dca_partial_and_full_close():
    fills = [
        _fill("1", 1_700_000_000_000, "buy", 1.0, 100.0),
        _fill("2", 1_700_000_000_100, "buy", 0.5, 90.0),
        _fill("3", 1_700_000_000_200, "sell", 0.25, 105.0, 2.5),
        _fill("4", 1_700_000_000_300, "sell", 1.25, 110.0, 18.75),
    ]

    events = timeline_events_from_fills(fills)

    assert _action(events[fills[0].event_id]) == "entry"
    assert _action(events[fills[1].event_id]) == "dca"
    assert _action(events[fills[2].event_id]) == "partial_exit"
    assert _action(events[fills[3].event_id]) == "full_exit"
    assert events[fills[3].event_id].payload["position_size_after"] == 0.0


def test_buy_after_full_close_is_entry_again():
    fills = [
        _fill("1", 1_700_000_000_000, "buy", 1.0, 100.0),
        _fill("2", 1_700_000_000_100, "sell", 1.0, 101.0, 1.0),
        _fill("3", 1_700_000_000_200, "buy", 0.5, 99.0),
    ]

    events = timeline_events_from_fills(fills)

    assert _action(events[fills[0].event_id]) == "entry"
    assert _action(events[fills[1].event_id]) == "full_exit"
    assert _action(events[fills[2].event_id]) == "entry"


def test_sell_without_position_is_exit_unknown():
    fill = _fill("1", 1_700_000_000_000, "sell", 1.0, 100.0, 0.5)

    event = timeline_events_from_fills([fill])[fill.event_id]

    assert _action(event) == "exit_unknown"
    assert event.payload["base_asset"] == "HYPE"
    assert event.payload["quote_asset"] == "USDC"
