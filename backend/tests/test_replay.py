"""End-to-end replay: fake SSH feeds the fixture through the collector twice.
The second run must be a no-op (idempotency).
"""

from __future__ import annotations

import pytest

from app.collector.cache_poller import CachePoller
from app.collector.vps_latency import VpsLatencyProbe
from app.collector.ssh_client import FakeSSHClient
from app.api.routes_http import bootstrap
from app.models import TimelineEvent
from app.persistence import repos


class MutableCacheTransport:
    def __init__(self, raw: bytes, mtime_ms: int) -> None:
        self.raw = raw
        self.mtime_ms = mtime_ms

    async def connect(self) -> None:
        return None

    async def close(self) -> None:
        return None

    async def read_file(self, remote_path: str) -> bytes:  # noqa: ARG002
        return self.raw

    async def file_stat(self, remote_path: str) -> tuple[int, int]:  # noqa: ARG002
        return self.mtime_ms, len(self.raw)

    async def tail_bytes(self, remote_path: str, offset: int) -> tuple[bytes, int]:  # noqa: ARG002
        return self.raw[offset:], len(self.raw)

    async def health_lines(self, remote_path: str) -> bytes:  # noqa: ARG002
        return b""

    async def run_command(self, cmd: str) -> bytes:  # noqa: ARG002
        return b""


@pytest.mark.asyncio
async def test_replay_is_idempotent(tmp_db):
    t = FakeSSHClient()
    await t.connect()
    poller = CachePoller(t)

    first_pass_count = await poller.poll_once()
    assert first_pass_count > 0
    before = len(await repos.all_fills())

    # Second pass — nothing new, same file content
    second_pass_count = await poller.poll_once()
    assert second_pass_count == 0
    after = len(await repos.all_fills())
    assert before == after

    # Even if we reset the poller's in-memory dedupe, the DB UNIQUE constraint holds.
    poller2 = CachePoller(t)
    third_pass = await poller2.poll_once()
    assert third_pass == 0
    final = len(await repos.all_fills())
    assert final == before


@pytest.mark.asyncio
async def test_same_size_cache_rewrite_is_ingested(tmp_db):
    first = (
        b'[{"timestamp":1774015215376,"id":"a","symbol":"HYPE/USDC:USDC",'
        b'"side":"buy","qty":1,"price":10}]'
    )
    second = (
        b'[{"timestamp":1774015215376,"id":"b","symbol":"HYPE/USDC:USDC",'
        b'"side":"buy","qty":1,"price":10}]'
    )
    assert len(first) == len(second)

    t = MutableCacheTransport(first, mtime_ms=1000)
    poller = CachePoller(t)
    assert await poller.poll_once() == 1

    t.raw = second
    t.mtime_ms = 2000
    assert await poller.poll_once() == 1

    assert len(await repos.all_fills()) == 2


@pytest.mark.asyncio
async def test_duplicate_raw_ids_with_different_fill_fields_both_ingest(tmp_db):
    raw = (
        b'[{"timestamp":1774015215376,"id":"same","symbol":"HYPE/USDC:USDC",'
        b'"side":"buy","qty":1,"price":10},'
        b'{"timestamp":1774015215377,"id":"same","symbol":"HYPE/USDC:USDC",'
        b'"side":"buy","qty":2,"price":11}]'
    )
    t = MutableCacheTransport(raw, mtime_ms=1000)
    poller = CachePoller(t)

    assert await poller.poll_once() == 2
    fills = await repos.all_fills()
    assert len(fills) == 2
    assert len({f.event_id for f in fills}) == 2


@pytest.mark.asyncio
async def test_write_failure_does_not_mark_cache_processed(tmp_db, monkeypatch):
    raw = (
        b'[{"timestamp":1774015215376,"id":"a","symbol":"HYPE/USDC:USDC",'
        b'"side":"buy","qty":1,"price":10}]'
    )
    t = MutableCacheTransport(raw, mtime_ms=1000)
    poller = CachePoller(t)

    original_insert_timeline = repos.insert_timeline

    async def fail_insert_timeline(*args, **kwargs):  # noqa: ANN002, ANN003
        raise RuntimeError("boom")

    monkeypatch.setattr(repos, "insert_timeline", fail_insert_timeline)
    assert await poller.poll_once() == 0
    assert poller._last_hash is None
    assert await repos.current_cursor() == 0
    assert await repos.all_fills() == []

    monkeypatch.setattr(repos, "insert_timeline", original_insert_timeline)
    assert await poller.poll_once() == 1
    assert poller._last_hash is not None
    assert await repos.current_cursor() == 1
    assert len(await repos.all_fills()) == 1


@pytest.mark.asyncio
async def test_cursors_are_monotonic(tmp_db):
    t = FakeSSHClient()
    await t.connect()
    poller = CachePoller(t)
    await poller.poll_once()

    events = await repos.timeline_since(0, limit=10_000)
    cursors = [c for c, _ in events]
    assert cursors == sorted(cursors)
    assert len(set(cursors)) == len(cursors)


@pytest.mark.asyncio
async def test_bootstrap_delta_paginates_without_skipping_cursor(tmp_db):
    async with repos.transaction():
        for i in range(501):
            cursor = await repos.next_cursor()
            await repos.insert_timeline(
                TimelineEvent(
                    event_id=f"system-{i}",
                    ts=1_774_015_215_376 + i,
                    category="system",
                    label=f"event {i}",
                    win_loss="neutral",
                    payload={},
                ),
                cursor,
            )

    first = await bootstrap(since=0)
    assert len(first["timeline"]) == 500
    assert first["cursor"] == 500
    assert first["server_cursor"] == 501
    assert first["has_more"] is True

    second = await bootstrap(since=first["cursor"])
    assert len(second["timeline"]) == 1
    assert second["cursor"] == 501
    assert second["server_cursor"] == 501
    assert second["has_more"] is False


@pytest.mark.asyncio
async def test_fake_ssh_latency_probe_is_noop():
    probe = VpsLatencyProbe(FakeSSHClient())
    assert await probe.probe_once() is None
