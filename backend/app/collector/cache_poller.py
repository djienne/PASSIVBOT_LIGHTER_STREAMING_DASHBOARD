"""Polls the single authoritative pnls JSON on the VPS.

Strategy
--------
1. Every ``POLL_INTERVAL_SECONDS`` (default 3s), read the remote file mtime + size.
2. If both are unchanged, skip (cheap cache-friendly stat).
3. If either stat value changed, read the whole file and SHA256 it.
4. If the hash changed, parse + insert idempotently. New fills emit both
   `fill` and `timeline.append` events on the bus.

The pnls JSON is tiny (tens of KB) so full-file reads are fine. For very
large files we could switch to trailing-read via `tail_bytes`, but there's
no need yet.
"""

from __future__ import annotations

import asyncio
import hashlib
import json

from ..config import settings
from ..envelope import now_ms
from ..events.bus import bus
from ..logging import log
from ..models import FillEvent, TimelineEvent
from ..persistence import repos
from .dedupe import LRUSet
from .parsers import fill_to_timeline, parse_fill_record
from .ssh_client import SSHTransport


class CachePoller:
    def __init__(self, transport: SSHTransport) -> None:
        self.t = transport
        self._seen = LRUSet(10_000)
        self._last_hash: str | None = None
        self._last_mtime_ms: int | None = None
        self._last_size: int | None = None
        self._last_sync_ts: int = 0

    @property
    def last_sync_ts(self) -> int:
        return self._last_sync_ts

    async def _backfill_seen_from_db(self) -> None:
        for f in await repos.all_fills():
            self._seen.add(f.event_id)

    async def poll_once(self) -> int:
        """Returns the number of new fills ingested in this pass."""
        remote = settings.pnls_remote_path
        try:
            mtime_ms, size = await self.t.file_stat(remote)
        except Exception as exc:  # noqa: BLE001
            log.warning("cache_poller: stat failed", error=str(exc))
            return 0

        if (
            self._last_size is not None
            and self._last_mtime_ms is not None
            and size == self._last_size
            and mtime_ms == self._last_mtime_ms
        ):
            return 0

        try:
            raw = await self.t.read_file(remote)
        except Exception as exc:  # noqa: BLE001
            log.warning("cache_poller: read failed", error=str(exc))
            return 0

        digest = hashlib.sha256(raw).hexdigest()
        if digest == self._last_hash:
            self._last_size = size
            self._last_mtime_ms = mtime_ms
            return 0

        try:
            records = json.loads(raw)
        except json.JSONDecodeError as exc:
            log.warning("cache_poller: json parse failed", error=str(exc))
            return 0
        if not isinstance(records, list):
            log.warning("cache_poller: expected a JSON array", kind=type(records).__name__)
            return 0

        pending: list[tuple[FillEvent, dict, TimelineEvent]] = []
        batch_seen: set[str] = set()
        for rec in records:
            try:
                fill = parse_fill_record(rec)
            except Exception as exc:  # noqa: BLE001
                log.warning("cache_poller: parse_fill_record failed", error=str(exc), rec=rec)
                continue
            if fill.event_id in self._seen or fill.event_id in batch_seen:
                continue
            tl = fill_to_timeline(fill)
            batch_seen.add(fill.event_id)
            pending.append((fill, rec, tl))

        published: list[tuple[int, FillEvent, TimelineEvent]] = []
        try:
            async with repos.transaction():
                for fill, rec, tl in pending:
                    inserted = await repos.insert_fill(fill, rec)
                    if not inserted:
                        continue
                    cursor = await repos.next_cursor()
                    tl_inserted = await repos.insert_timeline(tl, cursor)
                    if tl_inserted:
                        published.append((cursor, fill, tl))
        except Exception as exc:  # noqa: BLE001
            log.warning("cache_poller: write failed", error=str(exc))
            return 0

        self._last_hash = digest
        self._last_size = size
        self._last_mtime_ms = mtime_ms
        self._last_sync_ts = now_ms()
        for event_id in batch_seen:
            self._seen.add(event_id)

        for cursor, fill, tl in published:
            await bus.publish("fill", fill)
            await bus.publish("timeline.append", (cursor, tl))

        new_count = len(published)
        if new_count:
            log.info("cache_poller: ingested new fills", count=new_count)
        return new_count

    async def run(self) -> None:
        await self._backfill_seen_from_db()
        log.info("cache_poller: starting", poll_interval=settings.poll_interval_seconds)
        while True:
            try:
                await self.poll_once()
            except Exception as exc:  # noqa: BLE001
                log.error("cache_poller: loop error", error=str(exc))
            await asyncio.sleep(settings.poll_interval_seconds)
