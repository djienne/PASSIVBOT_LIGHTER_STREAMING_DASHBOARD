"""aiosqlite connection factory + one-shot migration."""

from __future__ import annotations

import hashlib
from pathlib import Path

import aiosqlite

from ..config import settings
from ..logging import log

SCHEMA = Path(__file__).parent / "schema.sql"


class Database:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or settings.database_path
        self._conn: aiosqlite.Connection | None = None

    async def connect(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = await aiosqlite.connect(self.path)
        self._conn.row_factory = aiosqlite.Row
        await self._conn.executescript(SCHEMA.read_text())
        await _migrate_fill_event_ids(self._conn)
        await self._conn.execute("PRAGMA journal_mode=WAL")
        await self._conn.commit()

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    @property
    def conn(self) -> aiosqlite.Connection:
        if self._conn is None:
            raise RuntimeError("Database not connected")
        return self._conn


db = Database()


def _fill_event_id(symbol: str, ts_ms: int, side: str, qty: float, price: float, raw_id: str | None) -> str:
    base = f"{symbol}|{ts_ms}|{side}|{qty:.8f}|{price:.8f}|{raw_id or ''}"
    h = hashlib.sha1(base.encode()).hexdigest()[:16]
    return f"lighter:{raw_id}:{h}" if raw_id else f"fp:{h}"


async def _migrate_fill_event_ids(conn: aiosqlite.Connection) -> None:
    async with conn.execute(
        "SELECT event_id, ts, symbol, side, qty, price, raw_id FROM fills WHERE raw_id IS NOT NULL"
    ) as cur:
        rows = await cur.fetchall()

    migrated = 0
    for row in rows:
        old_id = str(row["event_id"])
        raw_id = str(row["raw_id"])
        if old_id != f"lighter:{raw_id}":
            continue

        new_id = _fill_event_id(
            symbol=str(row["symbol"]),
            ts_ms=int(row["ts"]),
            side=str(row["side"]),
            qty=float(row["qty"]),
            price=float(row["price"]),
            raw_id=raw_id,
        )
        async with conn.execute(
            "SELECT 1 FROM fills WHERE event_id = ? UNION SELECT 1 FROM timeline_events WHERE event_id = ?",
            (new_id, new_id),
        ) as cur:
            if await cur.fetchone():
                log.warning("db: fill id migration skipped due to conflict", old_id=old_id, new_id=new_id)
                continue

        await conn.execute("UPDATE fills SET event_id = ? WHERE event_id = ?", (new_id, old_id))
        await conn.execute("UPDATE timeline_events SET event_id = ? WHERE event_id = ?", (new_id, old_id))
        migrated += 1

    if migrated:
        await conn.commit()
        log.info("db: migrated old fill event ids", count=migrated)
