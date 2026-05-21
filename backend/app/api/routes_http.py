"""HTTP endpoints — /api/bootstrap and /api/health."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..config import settings
from ..envelope import SCHEMA_VERSION, now_ms
from ..market.lighter_ws import ws_client
from ..metrics.engine import compute_snapshot
from ..metrics.pnl import current_position_from_fills, reconstruct_pnl_from_fills
from ..persistence import repos

router = APIRouter()
DELTA_LIMIT = 500


@router.get("/api/bootstrap")
async def bootstrap(since: int | None = Query(default=None)) -> dict:
    """Full page state, or deltas since a WS cursor on reconnect."""
    if since is not None:
        delivered_cursor, server_cursor, has_more, timeline_delta = await repos.timeline_delta_since(
            since,
            limit=DELTA_LIMIT,
        )
        delta_events = [
            {"cursor": c, "event": ev.model_dump()}
            for c, ev in timeline_delta
        ]
        return {
            "schema_version": SCHEMA_VERSION,
            "server_time": now_ms(),
            "cursor": delivered_cursor,
            "server_cursor": server_cursor,
            "has_more": has_more,
            "since": since,
            "timeline": delta_events,
        }

    async with repos.consistent_read():
        candles = [c.model_dump() for c in await repos.recent_candles(2880)]
        fills = await repos.all_fills()
        pos_state = current_position_from_fills(fills)
        # Always recompute metrics on bootstrap so the UI sees a fresh value.
        metrics = await compute_snapshot()
        starting_capital = await repos.resolve_starting_capital()

        latest_health = await repos.latest_health()
        latest_balance = await repos.latest_balance()
        latest_agg = await repos.latest_order_aggregate()
        latest_latency = await repos.latest_vps_latency()
        server_cursor = await repos.latest_timeline_cursor(lock=False)
        timeline = [ev.model_dump() for ev in await repos.recent_timeline(200)]

    latest_funding = ws_client.latest_funding
    latest_funding_total = ws_client.latest_funding_total
    position = {
        "side": "long" if pos_state.size > 0 else "flat",
        "size": pos_state.size,
        "avg_entry": pos_state.avg_entry,
        "mark": ws_client.last_price,
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "server_time": now_ms(),
        "cursor": server_cursor,
        "symbol": settings.symbol,
        "market_id": settings.market_id,
        "baseline": starting_capital.value,
        "starting_capital": starting_capital.value,
        "starting_capital_source": {
            "source": starting_capital.source,
            "updated_ts": starting_capital.updated_ts,
            "note": starting_capital.note,
        },
        "candles": candles,
        "position": position,
        "balance": latest_balance.model_dump() if latest_balance else None,
        "order_aggregate": latest_agg.model_dump() if latest_agg else None,
        "funding": latest_funding.model_dump() if latest_funding else None,
        "funding_total": latest_funding_total.model_dump() if latest_funding_total else None,
        "metrics": metrics.model_dump(),
        "timeline": timeline,
        "health": latest_health.model_dump() if latest_health else None,
        "market_ws_connected": ws_client.connected,
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


@router.get("/api/pnl-curve")
async def pnl_curve() -> dict:
    """All fill-derived trade points for the cumulative PnL chart."""
    starting_capital = await repos.resolve_starting_capital()
    fills = await repos.all_fills()
    if fills and all(f.pnl == 0 for f in fills):
        fills = reconstruct_pnl_from_fills(fills)

    cumulative = 0.0
    points = []
    for fill in fills:
        cumulative += fill.pnl
        points.append({
            "event_id": fill.event_id,
            "ts": fill.ts,
            "side": fill.side,
            "qty": fill.qty,
            "price": fill.price,
            "pnl": fill.pnl,
            "value": cumulative,
        })

    return {
        "schema_version": SCHEMA_VERSION,
        "server_time": now_ms(),
        "baseline": starting_capital.value,
        "starting_capital": starting_capital.value,
        "points": points,
    }
