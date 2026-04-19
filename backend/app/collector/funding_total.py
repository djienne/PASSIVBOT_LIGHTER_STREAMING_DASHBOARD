"""Background task: refresh the estimated total funding paid every hour.

Funding settles once an hour on Lighter, so refreshing more often than that
would be a waste of REST calls. On startup we run once immediately (so the
UI has a value on first page-load), then every hour at ~2 minutes past the
hour (to let Lighter close out the previous funding tick).
"""

from __future__ import annotations

import asyncio
import time

from ..envelope import now_ms
from ..events.bus import bus
from ..logging import log
from ..market.lighter_rest import fetch_candles, fetch_fundings
from ..market.lighter_ws import ws_client
from ..metrics.funding_estimator import estimate_total_funding_paid
from ..persistence import repos


class FundingTotalEstimator:
    async def _refresh_once(self) -> None:
        fills = await repos.all_fills()
        if not fills:
            log.info("funding_total: no fills yet, skipping")
            return
        earliest_ms = min(f.ts for f in fills)
        end_s = int(time.time())
        start_s = earliest_ms // 1000 - 3600  # pad one hour back for boundary safety

        fundings = await fetch_fundings(start_s=start_s, end_s=end_s)
        hourly_candles = await fetch_candles(resolution="1h", start_s=start_s, end_s=end_s)

        total = estimate_total_funding_paid(fills, fundings, hourly_candles)

        # Stash on the ws_client so the bootstrap payload + a future direct
        # fetch can both read the same snapshot.
        ws_client.latest_funding_total = total
        await bus.publish("funding_total.update", total)
        log.info(
            "funding_total: refreshed",
            total_usd=total.total_paid_usd,
            samples=total.samples_count,
            hours=total.hours_covered,
        )

    async def run(self) -> None:
        log.info("funding_total: starting")
        await asyncio.sleep(20)  # let collector bootstrap fills first
        try:
            await self._refresh_once()
        except Exception as exc:  # noqa: BLE001
            log.warning("funding_total: initial refresh failed", error=str(exc))

        while True:
            # Sleep until 2 min past the next hour.
            now = time.time()
            next_hour = (int(now) // 3600 + 1) * 3600
            wait = max(60, next_hour - int(now) + 120)
            await asyncio.sleep(wait)
            try:
                await self._refresh_once()
            except Exception as exc:  # noqa: BLE001
                log.warning("funding_total: refresh failed", error=str(exc))


estimator = FundingTotalEstimator()
