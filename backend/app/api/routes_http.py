"""HTTP endpoints — /api/bootstrap and /api/health."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..config import settings
from ..envelope import SCHEMA_VERSION, now_ms
from ..market.lighter_ws import ws_client
from ..metrics.engine import compute_snapshot
from ..metrics.pnl import current_position_from_fills
from ..persistence import repos

router = APIRouter()


@router.get("/api/bootstrap")
async def bootstrap(since: int | None = Query(default=None)) -> dict:
    """Full page state, or deltas since a WS cursor on reconnect."""
    candles = [c.model_dump() for c in await repos.recent_candles(2880)]
    fills = await repos.all_fills()
    pos_state = current_position_from_fills(fills)
    # Always recompute metrics on bootstrap so the UI sees a fresh value.
    metrics = await compute_snapshot()

    latest_health = await repos.latest_health()
    latest_balance = await repos.latest_balance()
    latest_agg = await repos.latest_order_aggregate()
    latest_latency = await repos.latest_vps_latency()
    latest_funding = ws_client.latest_funding
    cursor = await repos.current_cursor()

    if since is not None:
        delta_events = [
            {"cursor": c, "event": ev.model_dump()}
            for c, ev in await repos.timeline_since(since, limit=500)
        ]
        return {
            "schema_version": SCHEMA_VERSION,
            "server_time": now_ms(),
            "cursor": cursor,
            "since": since,
            "timeline": delta_events,
        }

    timeline = [ev.model_dump() for ev in await repos.recent_timeline(200)]
    position = {
        "side": "long" if pos_state.size > 0 else "flat",
        "size": pos_state.size,
        "avg_entry": pos_state.avg_entry,
        "mark": ws_client.last_price,
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "server_time": now_ms(),
        "cursor": cursor,
        "symbol": settings.symbol,
        "market_id": settings.market_id,
        "baseline": settings.display_baseline,
        "candles": candles,
        "position": position,
        "balance": latest_balance.model_dump() if latest_balance else None,
        "order_aggregate": latest_agg.model_dump() if latest_agg else None,
        "funding": latest_funding.model_dump() if latest_funding else None,
        "metrics": metrics.model_dump(),
        "timeline": timeline,
        "health": latest_health.model_dump() if latest_health else None,
        "vps_latency": latest_latency.model_dump() if latest_latency else None,
    }


@router.get("/api/health")
async def health() -> dict:
    latest_health = await repos.latest_health()
    return {
        "schema_version": SCHEMA_VERSION,
        "server_time": now_ms(),
        "backend_ok": True,
        "ws_connected": ws_client.connected,
        "last_price": ws_client.last_price,
        "health": latest_health.model_dump() if latest_health else None,
    }
