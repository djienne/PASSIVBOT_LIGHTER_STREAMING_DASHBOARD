"""Tiny in-process async pub/sub bus.

Collector / market / metrics modules publish to topics. The WS hub
and metrics engine subscribe. No external broker — everything lives
in a single FastAPI process.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

Handler = Callable[[str, Any], Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[tuple[str, Any]]]] = {}
        self._lock = asyncio.Lock()

    async def publish(self, topic: str, payload: Any) -> None:
        async with self._lock:
            queues = list(self._subscribers.get(topic, ()))
            queues += list(self._subscribers.get("*", ()))
        for q in queues:
            # Drop if subscriber is slow; don't block the publisher.
            if q.qsize() > 1024:
                continue
            q.put_nowait((topic, payload))

    async def subscribe(self, *topics: str) -> AsyncIterator[tuple[str, Any]]:
        q: asyncio.Queue[tuple[str, Any]] = asyncio.Queue(maxsize=2048)
        keys = topics or ("*",)
        async with self._lock:
            for t in keys:
                self._subscribers.setdefault(t, set()).add(q)
        try:
            while True:
                item = await q.get()
                yield item
        finally:
            async with self._lock:
                for t in keys:
                    self._subscribers.get(t, set()).discard(q)


bus = EventBus()
