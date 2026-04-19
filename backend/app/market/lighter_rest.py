"""Lighter REST — used for the chart's 2-day candle bootstrap and reconnect gap-fill."""

from __future__ import annotations

import time

import httpx

from ..config import settings
from ..logging import log
from ..models import Candle


_PAGE_SIZE = 500  # Lighter caps responses at ~500 candles per request


async def _fetch_page_any_resolution(
    client: httpx.AsyncClient,
    *,
    market_id: int,
    resolution: str,
    start_s: int,
    end_s: int,
    count: int,
) -> list[Candle]:
    url = f"{settings.lighter_rest_url}/api/v1/candles"
    params = {
        "market_id": market_id,
        "resolution": resolution,
        "start_timestamp": start_s,
        "end_timestamp": end_s,
        "count_back": count,
    }
    r = await client.get(url, params=params)
    r.raise_for_status()
    data = r.json()
    raw = data.get("c") or data.get("candlesticks") or []
    out: list[Candle] = []
    for row in raw:
        try:
            out.append(Candle(
                t=int(row["t"]),
                o=float(row["o"]),
                h=float(row["h"]),
                l=float(row["l"]),
                c=float(row["c"]),
                v=float(row.get("v", 0) or 0),
            ))
        except (KeyError, ValueError, TypeError):
            continue
    return out


async def fetch_candles(
    *,
    resolution: str,
    start_s: int,
    end_s: int,
    market_id: int | None = None,
) -> list[Candle]:
    """Paginated candle fetch at any resolution (1m, 5m, 15m, 1h, …)."""
    mid = market_id if market_id is not None else settings.market_id
    # Size of one REST page in seconds, estimated conservatively.
    step_seconds_map = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}
    step = step_seconds_map.get(resolution, 3600)
    page_seconds = _PAGE_SIZE * step
    collected: dict[int, Candle] = {}
    async with httpx.AsyncClient(timeout=20) as client:
        cursor = end_s
        while cursor > start_s:
            page_start = max(cursor - page_seconds, start_s)
            page = await _fetch_page_any_resolution(
                client,
                market_id=mid,
                resolution=resolution,
                start_s=page_start,
                end_s=cursor,
                count=_PAGE_SIZE,
            )
            if not page:
                break
            new_in_page = 0
            earliest = cursor
            for c in page:
                if c.t not in collected:
                    collected[c.t] = c
                    new_in_page += 1
                earliest = min(earliest, c.t // 1000)
            if new_in_page == 0:
                break
            cursor = earliest - 1
    return sorted(collected.values(), key=lambda c: c.t)


class FundingTick:
    __slots__ = ("timestamp", "rate_pct", "direction")

    def __init__(self, timestamp: int, rate_pct: float, direction: str) -> None:
        self.timestamp = timestamp        # seconds (end of the hour)
        self.rate_pct = rate_pct          # magnitude of hourly funding %
        self.direction = direction        # "long" or "short" = who pays

    @property
    def signed_rate_pct(self) -> float:
        """For a LONG bot: positive = we pay, negative = we receive."""
        return self.rate_pct if self.direction == "long" else -self.rate_pct

    def to_dict(self) -> dict:
        return {"timestamp": self.timestamp, "rate_pct": self.rate_pct, "direction": self.direction}


async def fetch_fundings(
    *,
    start_s: int,
    end_s: int,
    market_id: int | None = None,
) -> list[FundingTick]:
    """Public hourly funding history for `market_id`. Paginated — Lighter
    caps at ~500 per request so we walk backwards one page at a time."""
    mid = market_id if market_id is not None else settings.market_id
    page_seconds = _PAGE_SIZE * 3600
    collected: dict[int, FundingTick] = {}
    async with httpx.AsyncClient(timeout=20) as client:
        cursor = end_s
        while cursor > start_s:
            page_start = max(cursor - page_seconds, start_s)
            url = f"{settings.lighter_rest_url}/api/v1/fundings"
            params = {
                "market_id": mid,
                "resolution": "1h",
                "start_timestamp": page_start,
                "end_timestamp": cursor,
                "count_back": _PAGE_SIZE,
            }
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            raw = data.get("fundings") or []
            if not raw:
                break
            earliest = cursor
            new_in_page = 0
            for rec in raw:
                try:
                    ts = int(rec["timestamp"])
                    rate_pct = float(rec["rate"])
                    direction = str(rec.get("direction", "long"))
                except (KeyError, ValueError, TypeError):
                    continue
                if ts not in collected:
                    collected[ts] = FundingTick(ts, rate_pct, direction)
                    new_in_page += 1
                earliest = min(earliest, ts)
            if new_in_page == 0:
                break
            cursor = earliest - 1
    return sorted(collected.values(), key=lambda x: x.timestamp)


async def _fetch_page(
    client: httpx.AsyncClient,
    *,
    market_id: int,
    start_s: int,
    end_s: int,
    count: int,
) -> list[Candle]:
    url = f"{settings.lighter_rest_url}/api/v1/candles"
    params = {
        "market_id": market_id,
        "resolution": "1m",
        "start_timestamp": start_s,
        "end_timestamp": end_s,
        "count_back": count,
    }
    r = await client.get(url, params=params)
    r.raise_for_status()
    data = r.json()
    raw = data.get("c") or data.get("candlesticks") or []
    out: list[Candle] = []
    for row in raw:
        try:
            out.append(Candle(
                t=int(row["t"]),
                o=float(row["o"]),
                h=float(row["h"]),
                l=float(row["l"]),
                c=float(row["c"]),
                v=float(row.get("v", 0) or 0),
            ))
        except (KeyError, ValueError, TypeError):
            continue
    return out


async def fetch_candles_1m(
    *,
    market_id: int | None = None,
    hours: int = 48,
) -> list[Candle]:
    """Paginates the REST endpoint (which caps at ~500 candles per call)."""
    mid = market_id if market_id is not None else settings.market_id
    end = int(time.time())
    window_end = end
    window_start = end - hours * 3600
    page_seconds = _PAGE_SIZE * 60
    collected: dict[int, Candle] = {}
    async with httpx.AsyncClient(timeout=15) as client:
        cursor = window_end
        while cursor > window_start:
            page_start = max(cursor - page_seconds, window_start)
            page = await _fetch_page(
                client,
                market_id=mid,
                start_s=page_start,
                end_s=cursor,
                count=_PAGE_SIZE,
            )
            if not page:
                break
            new_in_page = 0
            earliest = cursor
            for c in page:
                if c.t not in collected:
                    collected[c.t] = c
                    new_in_page += 1
                earliest = min(earliest, c.t // 1000)
            if new_in_page == 0:
                break
            # Move the cursor to just before the earliest candle we saw.
            cursor = earliest - 1
    ordered = sorted(collected.values(), key=lambda c: c.t)
    log.info("lighter_rest: candles fetched", count=len(ordered), market_id=mid, hours=hours)
    return ordered
