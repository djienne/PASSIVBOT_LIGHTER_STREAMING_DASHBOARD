"""aiosqlite connection factory + one-shot migration."""

from __future__ import annotations

from pathlib import Path

import aiosqlite

from ..config import settings

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
