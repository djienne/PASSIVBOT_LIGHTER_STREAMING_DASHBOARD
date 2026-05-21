"""Event fingerprinting + bounded LRU memory for idempotency."""

from __future__ import annotations

import hashlib
from collections import OrderedDict


def fill_event_id(symbol: str, ts_ms: int, side: str, qty: float, price: float, raw_id: str | None) -> str:
    """Fingerprint every fill; Lighter raw ids can repeat across sub-fills."""
    base = f"{symbol}|{ts_ms}|{side}|{qty:.8f}|{price:.8f}|{raw_id or ''}"
    h = hashlib.sha1(base.encode()).hexdigest()[:16]
    return f"lighter:{raw_id}:{h}" if raw_id else f"fp:{h}"


def health_event_id(log_line_ts_ms: int) -> str:
    return f"health:{log_line_ts_ms}"


class LRUSet:
    def __init__(self, max_size: int = 10_000) -> None:
        self._data: OrderedDict[str, None] = OrderedDict()
        self._max = max_size

    def __contains__(self, key: str) -> bool:
        if key in self._data:
            self._data.move_to_end(key)
            return True
        return False

    def add(self, key: str) -> bool:
        """Returns True if this was a new key (not already present)."""
        if key in self._data:
            self._data.move_to_end(key)
            return False
        self._data[key] = None
        if len(self._data) > self._max:
            self._data.popitem(last=False)
        return True
