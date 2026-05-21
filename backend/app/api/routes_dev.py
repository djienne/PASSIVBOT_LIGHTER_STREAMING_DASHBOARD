"""Developer-only endpoints, enabled via settings. Safe to mount in dev,
exposed as POST /api/dev/* for animation / replay demos.
"""

from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from ..envelope import now_ms
from ..events.bus import bus
from ..models import TimelineEvent
from ..persistence import repos

router = APIRouter(prefix="/api/dev")


class InjectBody(BaseModel):
    kind: Literal["entry", "win", "loss", "order"]
    pnl: float = 0.0


@router.post("/inject")
async def inject_event(body: InjectBody) -> dict:
    eid = f"demo:{int(time.time() * 1000)}:{body.kind}"
    if body.kind == "entry":
        ev = TimelineEvent(event_id=eid, ts=now_ms(), category="trade", label="entry fill (demo)",
                            side="buy", qty=1.0, price=0.0, pnl=0.0, win_loss="neutral")
    elif body.kind == "win":
        ev = TimelineEvent(event_id=eid, ts=now_ms(), category="trade", label="winning close (demo)",
                            side="sell", qty=1.0, price=0.0, pnl=abs(body.pnl), win_loss="win")
    elif body.kind == "loss":
        ev = TimelineEvent(event_id=eid, ts=now_ms(), category="trade", label="losing close (demo)",
                            side="sell", qty=1.0, price=0.0, pnl=-abs(body.pnl), win_loss="loss")
    else:
        ev = TimelineEvent(event_id=eid, ts=now_ms(), category="order", label="order activity (demo)",
                            pnl=0.0, win_loss="neutral")
    async with repos.transaction():
        cursor = await repos.next_cursor()
        await repos.insert_timeline(ev, cursor)
    await bus.publish("timeline.append", (cursor, ev))
    return {"ok": True, "event_id": eid, "cursor": cursor}
