"""Lighter public WS client.

Subscribes to ``ticker/{market_id}`` for HYPE. Maintains the current 1m
candle in memory; each ticker print updates h/l/c and emits a
``candle.update`` event. On minute rollover the current candle is closed
(persisted via repos) and a new one opens, emitting ``candle.new``.

The ticker payload (from probe):

    {
      "channel": "ticker:24",
      "ticker": {"s":"HYPE", "a": {"price":"43.3570",...}, "b": {"price":"43.3524",...}},
      "timestamp": 1776613884599,
      "type": "update/ticker"
    }

We use mid-price (ask+bid)/2 for the chart price since Lighter's public
ticker is BBO-only.
"""

from __future__ import annotations

import asyncio
import json

import websockets

from ..config import settings
from ..envelope import now_ms
from ..events.bus import bus
from ..logging import log
from ..metrics.engine import on_ticker as metrics_on_ticker
from ..models import Candle
from ..persistence import repos


def _minute_bucket(ts_ms: int) -> int:
    return (ts_ms // 60_000) * 60_000


class LighterWSClient:
    def __init__(self) -> None:
        self._stop = asyncio.Event()
        self.current_candle: Candle | None = None
        self.last_price: float = 0.0
        self.connected: bool = False

    def stop(self) -> None:
        self._stop.set()

    async def _handle_ticker(self, msg: dict) -> None:
        ticker = msg.get("ticker") or {}
        ask = ticker.get("a") or {}
        bid = ticker.get("b") or {}
        try:
            ap = float(ask.get("price", 0) or 0)
            bp = float(bid.get("price", 0) or 0)
        except (ValueError, TypeError):
            return
        if ap <= 0 or bp <= 0:
            return
        price = (ap + bp) / 2
        self.last_price = price
        await metrics_on_ticker(price)

        server_ts = int(msg.get("timestamp") or now_ms())
        bucket = _minute_bucket(server_ts)

        if self.current_candle is None or bucket > self.current_candle.t:
            if self.current_candle is not None:
                await repos.upsert_candle(self.current_candle)
                await repos.commit()
                await bus.publish("candle.update", self.current_candle)
            new_candle = Candle(t=bucket, o=price, h=price, l=price, c=price, v=0.0)
            self.current_candle = new_candle
            await bus.publish("candle.new", new_candle)
            return

        c = self.current_candle
        updated = c.model_copy(update={
            "h": max(c.h, price),
            "l": min(c.l, price),
            "c": price,
        })
        self.current_candle = updated
        await bus.publish("candle.update", updated)

    async def _run_once(self) -> None:
        url = settings.lighter_ws_url
        mid = settings.market_id
        log.info("lighter_ws: connecting", url=url, market_id=mid)
        async with websockets.connect(url, ping_interval=15, close_timeout=5) as ws:
            await ws.send(json.dumps({"type": "subscribe", "channel": f"ticker/{mid}"}))
            self.connected = True
            await bus.publish("ws.connected", True)
            try:
                while not self._stop.is_set():
                    raw = await ws.recv()
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    mtype = msg.get("type", "")
                    if mtype.startswith("update/ticker") or mtype.startswith("subscribed/ticker"):
                        await self._handle_ticker(msg)
            finally:
                self.connected = False
                await bus.publish("ws.connected", False)

    async def run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                await self._run_once()
                backoff = 1.0
            except Exception as exc:  # noqa: BLE001
                log.warning("lighter_ws: disconnected; reconnecting", error=str(exc), backoff=backoff)
                self.connected = False
                await bus.publish("ws.connected", False)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)


ws_client = LighterWSClient()
