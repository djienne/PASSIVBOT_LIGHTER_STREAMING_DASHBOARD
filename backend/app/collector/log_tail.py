"""Tails the VPS debug log for the bot's [health] INFO lines.

The bot prints a summary every ~15 minutes like

    2026-04-19T15:41:31 INFO     [lighter] [health] uptime=4.0d17.0h16.0m | positions=1 long, 0 short | balance=847.43 USDC | ...

We grep server-side (the file is noisy — 99.99% raw WS frames) and
surface only matching lines. Idempotent via the line's timestamp as the
event id.
"""

from __future__ import annotations

import asyncio

from ..config import settings
from ..envelope import now_ms
from ..events.bus import bus
from ..logging import log
from ..persistence import repos
from .dedupe import LRUSet
from .parsers import parse_health_line


class HealthLogTail:
    def __init__(self, transport) -> None:  # type: ignore[no-untyped-def]
        self.t = transport
        self._seen = LRUSet(1024)

    async def poll_once(self) -> int:
        """Use `grep` on the remote to pull the last N health lines cheaply."""
        remote = settings.debug_log_remote_path
        try:
            out = await self.t.health_lines(remote)
            poll_ok_ts = now_ms()
        except AttributeError:
            # FakeSSH path — read fixture instead
            return 0
        except Exception as exc:  # noqa: BLE001
            log.warning("log_tail: grep failed", error=str(exc))
            return 0

        pending = []
        for line in out.decode(errors="replace").splitlines():
            parsed = parse_health_line(line)
            if not parsed:
                continue
            health, balance, agg = parsed
            key = f"health:{health.ts}"
            if key in self._seen:
                continue
            health = health.model_copy(update={"vps_sync_age_ms": now_ms() - health.ts, "last_poll_ok": poll_ok_ts})
            pending.append((key, health, balance, agg))

        if not pending:
            latest = await repos.latest_health()
            if latest:
                latest = latest.model_copy(update={"vps_sync_age_ms": now_ms() - latest.ts, "last_poll_ok": poll_ok_ts})
                try:
                    async with repos.transaction():
                        await repos.save_health(latest)
                    await bus.publish("health.update", latest)
                except Exception as exc:
                    log.warning("log_tail: refresh failed", error=str(exc))
            return 0

        try:
            async with repos.transaction():
                for _, health, balance, agg in pending:
                    await repos.save_health(health)
                    if balance:
                        await repos.upsert_balance(balance)
                    if agg:
                        await repos.upsert_order_aggregate(agg)
        except Exception as exc:  # noqa: BLE001
            log.warning("log_tail: write failed", error=str(exc))
            return 0

        for key, health, balance, agg in pending:
            self._seen.add(key)
            await bus.publish("health.update", health)
            if balance:
                await bus.publish("balance.update", balance)
            if agg:
                await bus.publish("order.update", agg)

        return len(pending)

    async def run(self) -> None:
        log.info("log_tail: starting")
        # Slower cadence — health line emits once per ~15 min.
        while True:
            try:
                await self.poll_once()
            except Exception as exc:  # noqa: BLE001
                log.error("log_tail: error", error=str(exc))
            await asyncio.sleep(10)
