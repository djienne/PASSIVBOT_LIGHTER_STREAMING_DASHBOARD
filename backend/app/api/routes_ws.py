"""WebSocket hub.

Each client gets its own bounded send queue. A background coalescer throttles
bursty events (e.g. ticker updates) to avoid flooding the browser.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..envelope import SCHEMA_VERSION, envelope, now_ms
from ..events.bus import bus
from ..logging import log

router = APIRouter()

# Topics forwarded to clients as WS envelopes.
FORWARD_TOPICS = {
    "fill": "fill",
    "candle.update": "candle.update",
    "candle.new": "candle.new",
    "timeline.append": "timeline.append",
    "metrics.update": "metrics.update",
    "health.update": "health.update",
    "balance.update": "balance.update",
    "order.update": "order.update",
    "funding.update": "funding.update",
    "funding_total.update": "funding_total.update",
    "vps_latency.update": "vps_latency.update",
    "market_ws.update": "market_ws.update",
}

THROTTLE_HZ = 10  # max outgoing messages/sec per client
MIN_INTERVAL = 1 / THROTTLE_HZ


def _to_envelope(topic: str, payload) -> dict:
    # Derive a deterministic id + data shape per topic.
    if topic == "fill":
        return envelope(type_="fill", id_=payload.event_id, cursor=0, data=payload.model_dump()).model_dump()
    if topic in ("candle.update", "candle.new"):
        return envelope(
            type_=FORWARD_TOPICS[topic],  # type: ignore[arg-type]
            id_=f"candle:{payload.t}",
            cursor=0,
            data=payload.model_dump(),
        ).model_dump()
    if topic == "timeline.append":
        cursor, ev = payload  # type: ignore[misc]
        return envelope(
            type_="timeline.append",
            id_=ev.event_id,
            cursor=cursor,
            data=ev.model_dump(),
        ).model_dump()
    if topic == "metrics.update":
        return envelope(
            type_="metrics.update",
            id_=f"metrics:{payload.ts}",
            cursor=0,
            data=payload.model_dump(),
        ).model_dump()
    if topic == "health.update":
        return envelope(
            type_="health.update",
            id_=f"health:{payload.ts}",
            cursor=0,
            data=payload.model_dump(),
        ).model_dump()
    if topic == "balance.update":
        return envelope(
            type_="balance.update",
            id_=f"balance:{payload.snapshot_ts}",
            cursor=0,
            data=payload.model_dump(),
        ).model_dump()
    if topic == "order.update":
        return envelope(
            type_="order.update",
            id_=f"orders:{payload.snapshot_ts}",
            cursor=0,
            data=payload.model_dump(),
        ).model_dump()
    if topic == "funding.update":
        return envelope(
            type_="funding.update",
            id_=f"funding:{payload.ts}",
            cursor=0,
            data=payload.model_dump(),
        ).model_dump()
    if topic == "funding_total.update":
        return envelope(
            type_="funding_total.update",
            id_=f"funding_total:{payload.ts}",
            cursor=0,
            data=payload.model_dump(),
        ).model_dump()
    if topic == "vps_latency.update":
        return envelope(
            type_="vps_latency.update",
            id_=f"latency:{payload.ts}",
            cursor=0,
            data=payload.model_dump(),
        ).model_dump()
    if topic == "market_ws.update":
        return envelope(
            type_="market_ws.update",
            id_=f"market-ws:{now_ms()}",
            cursor=0,
            data={"connected": bool(payload)},
        ).model_dump()
    return envelope(type_="error", id_=f"unk:{topic}", cursor=0, data={"topic": topic}).model_dump()


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    send_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=4096)

    async def _reader() -> None:
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass

    async def _bus_subscriber() -> None:
        async for topic, payload in bus.subscribe(*FORWARD_TOPICS.keys()):
            try:
                env = _to_envelope(topic, payload)
            except Exception as exc:  # noqa: BLE001
                log.warning("ws: envelope build failed", topic=topic, error=str(exc))
                continue
            if send_queue.qsize() > 3500:
                continue
            await send_queue.put(env)

    async def _writer() -> None:
        last_flush = 0.0
        pending_coalesce: dict[str, dict] = {}
        while True:
            try:
                item = await asyncio.wait_for(send_queue.get(), timeout=MIN_INTERVAL)
            except asyncio.TimeoutError:
                item = None

            now = now_ms() / 1000
            if item is not None:
                # Coalesce ticker-like burst topics by id.
                env_type = item["type"]
                if env_type == "candle.update":
                    pending_coalesce[f"candle:{item['id']}"] = item
                else:
                    await _send(ws, item)

            # Flush coalesced bucket if we've drifted past THROTTLE interval.
            if pending_coalesce and (now - last_flush) >= MIN_INTERVAL:
                for env in list(pending_coalesce.values()):
                    await _send(ws, env)
                pending_coalesce.clear()
                last_flush = now_ms() / 1000

    # Send hello
    await _send(ws, envelope(type_="hello", id_="hello", cursor=0, data={"v": SCHEMA_VERSION}).model_dump())

    tasks = [asyncio.create_task(t) for t in (_reader(), _bus_subscriber(), _writer())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in tasks:
            t.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await t


async def _send(ws: WebSocket, env: dict) -> None:
    try:
        await ws.send_text(json.dumps(env, default=str))
    except Exception:
        raise WebSocketDisconnect()
