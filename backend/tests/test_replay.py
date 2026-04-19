"""End-to-end replay: fake SSH feeds the fixture through the collector twice.
The second run must be a no-op (idempotency).
"""

from __future__ import annotations

import pytest

from app.collector.cache_poller import CachePoller
from app.collector.ssh_client import FakeSSHClient
from app.persistence import repos


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
async def test_cursors_are_monotonic(tmp_db):
    t = FakeSSHClient()
    await t.connect()
    poller = CachePoller(t)
    await poller.poll_once()

    events = await repos.timeline_since(0, limit=10_000)
    cursors = [c for c, _ in events]
    assert cursors == sorted(cursors)
    assert len(set(cursors)) == len(cursors)
