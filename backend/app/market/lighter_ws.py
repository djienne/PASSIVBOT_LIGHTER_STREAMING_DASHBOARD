"""Lighter public WS client.

Subscribes to ``ticker/{market_id}`` and ``market_stats/{market_id}`` for HYPE.
Maintains the current 1m candle in memory; each ticker print updates h/l/c and
emits a ``candle.update`` event. On minute rollover the current candle is
closed (persisted via repos) and a new one opens, emitting ``candle.new``.

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
from ..models import Candle, FundingSnapshot
from ..persistence import repos


def _minute_bucket(ts_ms: int) -> int:
    return (ts_ms // 60_000) * 60_000


def annualize_hourly_funding_rate_pct(rate_pct_hour: float) -> float:
    """Funding payments occur at each hour mark, so annualized APR is the
    hourly rate multiplied by 24 hours and 365.25 days.

    The websocket's `current_funding_rate` field is treated as an hourly
    percentage value (e.g. `0.0057` means 0.0057%/hour).
    """
    return rate_pct_hour * 24 * 365.25


class LighterWSClient:
    def __init__(self) -> None:
        self._stop = asyncio.Event()
        self.current_candle: Candle | None = None
        self.last_price: float = 0.0
        self.latest_funding: FundingSnapshot | None = None
        self.latest_funding_total = None  # type: ignore[assignment]  # models.FundingTotal | None
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
                async with repos.transaction():
                    await repos.upsert_candle(self.current_candle)
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

    async def _handle_market_stats(self, msg: dict) -> None:
        stats = msg.get("market_stats") or {}
        try:
            market_id = int(stats.get("market_id", settings.market_id))
            current_rate_pct_hour = float(stats["current_funding_rate"])
        except (KeyError, ValueError, TypeError):
            return

        funding_timestamp = stats.get("funding_timestamp")
        try:
            funding_timestamp = int(funding_timestamp) if funding_timestamp is not None else None
        except (ValueError, TypeError):
            funding_timestamp = None

        snap = FundingSnapshot(
            ts=now_ms(),
            market_id=market_id,
            current_rate_pct_hour=current_rate_pct_hour,
            annualized_apr_pct=annualize_hourly_funding_rate_pct(current_rate_pct_hour),
            funding_timestamp=funding_timestamp,
        )
        self.latest_funding = snap
        await bus.publish("funding.update", snap)

    async def _run_once(self) -> None:
        url = settings.lighter_ws_url
        mid = settings.market_id
        log.info("lighter_ws: connecting", url=url, market_id=mid)
        async with websockets.connect(url, ping_interval=15, close_timeout=5) as ws:
            await ws.send(json.dumps({"type": "subscribe", "channel": f"ticker/{mid}"}))
            await ws.send(json.dumps({"type": "subscribe", "channel": f"market_stats/{mid}"}))
            self.connected = True
            await bus.publish("market_ws.update", True)
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
                    elif mtype.startswith("update/market_stats") or mtype.startswith("subscribed/market_stats"):
                        await self._handle_market_stats(msg)
            finally:
                self.connected = False
                await bus.publish("market_ws.update", False)

    async def run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                await self._run_once()
                backoff = 1.0
            except Exception as exc:  # noqa: BLE001
                log.warning("lighter_ws: disconnected; reconnecting", error=str(exc), backoff=backoff)
                self.connected = False
                await bus.publish("market_ws.update", False)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)


ws_client = LighterWSClient()
