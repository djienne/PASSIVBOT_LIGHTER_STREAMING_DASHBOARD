"""Raw cache JSON / log lines -> normalized models."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from ..models import BalanceSnapshot, FillEvent, HealthSnapshot, OrderAggregate
from .dedupe import fill_event_id, health_event_id
from .trade_classifier import fill_to_timeline


def parse_fill_record(raw: dict) -> FillEvent:
    ts = int(raw["timestamp"])
    # Lighter uses milliseconds already (timestamps like 1774015215376).
    if ts < 1e12:
        ts *= 1000
    raw_id = str(raw.get("id")) if raw.get("id") is not None else None
    symbol = str(raw.get("symbol") or "HYPE/USDC:USDC")
    side = str(raw["side"])
    qty = float(raw.get("qty") or raw.get("amount") or 0.0)
    price = float(raw["price"])
    pnl = float(raw.get("pnl") or 0.0)
    position_side = str(raw.get("position_side") or "long")
    event_id = fill_event_id(symbol, ts, side, qty, price, raw_id)
    return FillEvent(
        event_id=event_id,
        ts=ts,
        symbol=symbol,
        side=side,  # type: ignore[arg-type]
        qty=qty,
        price=price,
        pnl=pnl,
        position_side=position_side,  # type: ignore[arg-type]
        raw_id=raw_id,
    )


# Example line:
# 2026-04-19T15:41:31 INFO     [lighter] [health] uptime=4.0d17.0h16.0m | positions=1 long, 0 short | balance=847.43 USDC | orders_placed=45 | orders_cancelled=23 | fills=0 | errors=0 | ws_reconnects=0 | rate_limits=0
HEALTH_LINE_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\s+INFO\s+\[lighter\]\s+\[health\]\s+(?P<body>.*)$"
)
UPTIME_RE = re.compile(r"(?P<d>\d+(?:\.\d+)?)d(?P<h>\d+(?:\.\d+)?)h(?P<m>\d+(?:\.\d+)?)m")


def _parse_kv_body(body: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in body.split("|"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def _parse_uptime(s: str) -> int | None:
    m = UPTIME_RE.search(s)
    if not m:
        return None
    return int(float(m.group("d")) * 86400 + float(m.group("h")) * 3600 + float(m.group("m")) * 60)


def parse_health_line(line: str) -> tuple[HealthSnapshot, BalanceSnapshot | None, OrderAggregate | None] | None:
    m = HEALTH_LINE_RE.match(line)
    if not m:
        return None
    ts = int(datetime.strptime(m.group("ts"), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp() * 1000)
    kv = _parse_kv_body(m.group("body"))

    balance_val = kv.get("balance", "")
    try:
        balance = float(balance_val.split()[0]) if balance_val else None
    except (ValueError, IndexError):
        balance = None

    orders_placed = int(kv.get("orders_placed", "0") or 0)
    orders_cancelled = int(kv.get("orders_cancelled", "0") or 0)
    fills_count = int(kv.get("fills", "0") or 0)

    uptime = _parse_uptime(kv.get("uptime", ""))

    errors = int(kv.get("errors", "0") or 0)
    reconnects = int(kv.get("ws_reconnects", "0") or 0)
    rate_limits = int(kv.get("rate_limits", "0") or 0)

    health = HealthSnapshot(
        ts=ts,
        vps_sync_age_ms=None,  # filled by collector when publishing
        bot_uptime_seconds=uptime,
        bot_errors=errors,
        bot_ws_reconnects=reconnects,
        bot_rate_limits=rate_limits,
        ws_connected=True,  # inferred; updated by market module
    )
    balance_snap = BalanceSnapshot(snapshot_ts=ts, balance=balance) if balance is not None else None
    agg = OrderAggregate(
        snapshot_ts=ts,
        orders_placed=orders_placed,
        orders_cancelled=orders_cancelled,
        fills_count=fills_count,
    )
    return health, balance_snap, agg


# Re-export for call sites that want to tag the health event.
__all__ = [
    "parse_fill_record",
    "fill_to_timeline",
    "parse_health_line",
    "health_event_id",
]
