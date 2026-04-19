"""WS envelope helpers — schema-versioned, cursor-numbered."""

from __future__ import annotations

import time
from typing import Any, Literal

from pydantic import BaseModel

SCHEMA_VERSION = 1

EnvelopeType = Literal[
    "hello",
    "candle.update",
    "candle.new",
    "fill",
    "order.update",
    "position.update",
    "balance.update",
    "metrics.update",
    "timeline.append",
    "health.update",
    "vps_latency.update",
    "replay.start",
    "replay.end",
    "error",
]


class Envelope(BaseModel):
    v: int = SCHEMA_VERSION
    type: EnvelopeType
    id: str
    ts: int
    cursor: int
    data: dict[str, Any]


def now_ms() -> int:
    return int(time.time() * 1000)


def envelope(
    *,
    type_: EnvelopeType,
    id_: str,
    cursor: int,
    data: dict[str, Any],
    ts: int | None = None,
) -> Envelope:
    return Envelope(
        v=SCHEMA_VERSION,
        type=type_,
        id=id_,
        ts=ts if ts is not None else now_ms(),
        cursor=cursor,
        data=data,
    )
