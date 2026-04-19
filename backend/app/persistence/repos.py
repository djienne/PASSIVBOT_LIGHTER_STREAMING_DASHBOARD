"""Typed repositories over the SQLite tables.

All writes are idempotent: re-inserting an event with the same `event_id`
is a no-op thanks to the UNIQUE PK. Snapshot tables use snapshot_ts as PK,
so replayed snapshots are deduped the same way.
"""

from __future__ import annotations

import json
from typing import Any

from ..models import (
    BalanceSnapshot,
    Candle,
    FillEvent,
    HealthSnapshot,
    MetricsSnapshot,
    OrderAggregate,
    PositionSnapshot,
    TimelineEvent,
    VpsLatencySnapshot,
)
from .db import db


async def next_cursor() -> int:
    async with db.conn.execute(
        "UPDATE cursor_state SET value = value + 1 WHERE id = 1 RETURNING value"
    ) as cur:
        row = await cur.fetchone()
        await db.conn.commit()
        return int(row[0])


async def current_cursor() -> int:
    async with db.conn.execute("SELECT value FROM cursor_state WHERE id = 1") as cur:
        row = await cur.fetchone()
        return int(row[0]) if row else 0


async def upsert_candle(c: Candle) -> None:
    await db.conn.execute(
        """
        INSERT INTO candles (t, o, h, l, c, v) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(t) DO UPDATE SET
            o=excluded.o, h=excluded.h, l=excluded.l, c=excluded.c, v=excluded.v
        """,
        (c.t, c.o, c.h, c.l, c.c, c.v),
    )


async def recent_candles(limit: int = 2880) -> list[Candle]:
    async with db.conn.execute(
        "SELECT t, o, h, l, c, v FROM candles ORDER BY t DESC LIMIT ?", (limit,)
    ) as cur:
        rows = await cur.fetchall()
    rows.reverse()
    return [Candle(t=r[0], o=r[1], h=r[2], l=r[3], c=r[4], v=r[5]) for r in rows]


async def insert_fill(f: FillEvent, raw: dict[str, Any]) -> bool:
    """Returns True if inserted (new), False if already present."""
    async with db.conn.execute(
        """
        INSERT OR IGNORE INTO fills
            (event_id, ts, symbol, side, qty, price, pnl, position_side, raw_id, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            f.event_id, f.ts, f.symbol, f.side, f.qty, f.price, f.pnl,
            f.position_side, f.raw_id, json.dumps(raw),
        ),
    ) as cur:
        inserted = cur.rowcount > 0
    return inserted


async def all_fills() -> list[FillEvent]:
    async with db.conn.execute(
        "SELECT event_id, ts, symbol, side, qty, price, pnl, position_side, raw_id FROM fills ORDER BY ts"
    ) as cur:
        rows = await cur.fetchall()
    return [
        FillEvent(
            event_id=r[0], ts=r[1], symbol=r[2], side=r[3], qty=r[4], price=r[5],
            pnl=r[6], position_side=r[7], raw_id=r[8],
        )
        for r in rows
    ]


async def insert_timeline(ev: TimelineEvent, cursor: int) -> bool:
    async with db.conn.execute(
        """
        INSERT OR IGNORE INTO timeline_events
            (event_id, ts, category, label, side, price, qty, pnl, win_loss, payload, cursor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ev.event_id, ev.ts, ev.category, ev.label, ev.side, ev.price, ev.qty,
            ev.pnl, ev.win_loss, json.dumps(ev.payload), cursor,
        ),
    ) as cur:
        inserted = cur.rowcount > 0
    return inserted


async def recent_timeline(limit: int = 200) -> list[TimelineEvent]:
    async with db.conn.execute(
        "SELECT event_id, ts, category, label, side, price, qty, pnl, win_loss, payload "
        "FROM timeline_events ORDER BY ts DESC LIMIT ?",
        (limit,),
    ) as cur:
        rows = await cur.fetchall()
    out = []
    for r in rows:
        payload = json.loads(r[9]) if r[9] else {}
        out.append(TimelineEvent(
            event_id=r[0], ts=r[1], category=r[2], label=r[3],
            side=r[4], price=r[5], qty=r[6], pnl=r[7], win_loss=r[8], payload=payload,
        ))
    return out


async def timeline_since(cursor: int, limit: int = 500) -> list[tuple[int, TimelineEvent]]:
    async with db.conn.execute(
        "SELECT cursor, event_id, ts, category, label, side, price, qty, pnl, win_loss, payload "
        "FROM timeline_events WHERE cursor > ? ORDER BY cursor ASC LIMIT ?",
        (cursor, limit),
    ) as cur:
        rows = await cur.fetchall()
    out: list[tuple[int, TimelineEvent]] = []
    for r in rows:
        payload = json.loads(r[10]) if r[10] else {}
        ev = TimelineEvent(
            event_id=r[1], ts=r[2], category=r[3], label=r[4],
            side=r[5], price=r[6], qty=r[7], pnl=r[8], win_loss=r[9], payload=payload,
        )
        out.append((int(r[0]), ev))
    return out


async def upsert_position(p: PositionSnapshot) -> None:
    await db.conn.execute(
        "INSERT OR REPLACE INTO positions (snapshot_ts, side, size, avg_entry, source) VALUES (?, ?, ?, ?, ?)",
        (p.snapshot_ts, p.side, p.size, p.avg_entry, p.source),
    )


async def latest_position() -> PositionSnapshot | None:
    async with db.conn.execute(
        "SELECT snapshot_ts, side, size, avg_entry, source FROM positions ORDER BY snapshot_ts DESC LIMIT 1"
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    return PositionSnapshot(
        snapshot_ts=row[0], side=row[1], size=row[2], avg_entry=row[3], source=row[4]
    )


async def upsert_balance(b: BalanceSnapshot) -> None:
    await db.conn.execute(
        "INSERT OR REPLACE INTO balances (snapshot_ts, balance, source) VALUES (?, ?, ?)",
        (b.snapshot_ts, b.balance, b.source),
    )


async def latest_balance() -> BalanceSnapshot | None:
    async with db.conn.execute(
        "SELECT snapshot_ts, balance, source FROM balances ORDER BY snapshot_ts DESC LIMIT 1"
    ) as cur:
        row = await cur.fetchone()
    return BalanceSnapshot(snapshot_ts=row[0], balance=row[1], source=row[2]) if row else None


async def upsert_order_aggregate(o: OrderAggregate) -> None:
    await db.conn.execute(
        "INSERT OR REPLACE INTO order_aggregates (snapshot_ts, orders_placed, orders_cancelled, fills_count) VALUES (?, ?, ?, ?)",
        (o.snapshot_ts, o.orders_placed, o.orders_cancelled, o.fills_count),
    )


async def latest_order_aggregate() -> OrderAggregate | None:
    async with db.conn.execute(
        "SELECT snapshot_ts, orders_placed, orders_cancelled, fills_count FROM order_aggregates ORDER BY snapshot_ts DESC LIMIT 1"
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    return OrderAggregate(
        snapshot_ts=row[0], orders_placed=row[1], orders_cancelled=row[2], fills_count=row[3]
    )


async def save_metrics(m: MetricsSnapshot) -> None:
    await db.conn.execute(
        "INSERT OR REPLACE INTO metrics_snapshots (ts, json) VALUES (?, ?)",
        (m.ts, m.model_dump_json()),
    )


async def latest_metrics() -> MetricsSnapshot | None:
    async with db.conn.execute(
        "SELECT json FROM metrics_snapshots ORDER BY ts DESC LIMIT 1"
    ) as cur:
        row = await cur.fetchone()
    return MetricsSnapshot.model_validate_json(row[0]) if row else None


async def historical_equity_curve() -> list[tuple[int, float]]:
    """Sampled equity history from previously saved metrics snapshots.

    Drops cold-start phantoms: samples where `realized_pnl == 0` while a
    later sample in the same session has non-zero realized. That pattern
    only happens if metrics ran before the collector finished ingesting
    fills, so the sample doesn't reflect true equity at that moment.
    """
    async with db.conn.execute(
        "SELECT ts, json FROM metrics_snapshots ORDER BY ts ASC"
    ) as cur:
        rows = await cur.fetchall()

    snaps: list[tuple[int, MetricsSnapshot]] = []
    for row in rows:
        snap = MetricsSnapshot.model_validate_json(row[1])
        snaps.append((int(row[0]), snap))

    if not snaps:
        return []

    max_realized = max(s.realized_pnl for _, s in snaps)
    filtered: list[tuple[int, MetricsSnapshot]] = []
    for ts, s in snaps:
        # Drop samples that look like cold-start phantoms: no realized PnL
        # even though some later sample in this session recorded positive
        # realized PnL (i.e. fills existed but the snapshot captured state
        # before the collector ingested them).
        if s.realized_pnl == 0 and max_realized > 1.0:
            continue
        filtered.append((ts, s))

    return [(ts, s.baseline + s.total_pnl) for ts, s in filtered]


async def save_health(h: HealthSnapshot) -> None:
    await db.conn.execute(
        "INSERT OR REPLACE INTO health_snapshots (ts, json) VALUES (?, ?)",
        (h.ts, h.model_dump_json()),
    )


async def latest_health() -> HealthSnapshot | None:
    async with db.conn.execute(
        "SELECT json FROM health_snapshots ORDER BY ts DESC LIMIT 1"
    ) as cur:
        row = await cur.fetchone()
    return HealthSnapshot.model_validate_json(row[0]) if row else None


async def save_vps_latency(v: VpsLatencySnapshot) -> None:
    await db.conn.execute(
        "INSERT OR REPLACE INTO vps_latency_snapshots (ts, json) VALUES (?, ?)",
        (v.ts, v.model_dump_json()),
    )


async def latest_vps_latency() -> VpsLatencySnapshot | None:
    async with db.conn.execute(
        "SELECT json FROM vps_latency_snapshots ORDER BY ts DESC LIMIT 1"
    ) as cur:
        row = await cur.fetchone()
    return VpsLatencySnapshot.model_validate_json(row[0]) if row else None


async def commit() -> None:
    await db.conn.commit()
