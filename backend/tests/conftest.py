"""Shared pytest fixtures."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
import pytest_asyncio

from app.config import settings
from app.persistence.db import Database


@pytest.fixture(scope="session")
def event_loop():  # noqa: D401
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def tmp_db(tmp_path: Path):
    db_path = tmp_path / "test.db"
    # Override the shared singleton's path for this test.
    from app.persistence import db as db_mod
    original_conn = db_mod.db._conn
    db_mod.db.path = db_path
    db_mod.db._conn = None
    await db_mod.db.connect()
    yield db_mod.db
    await db_mod.db.close()
    db_mod.db._conn = original_conn


@pytest.fixture
def fixtures_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "data" / "fixtures"


@pytest.fixture(autouse=True)
def _use_fixtures(monkeypatch, fixtures_dir):
    monkeypatch.setattr(settings, "fixtures_dir", fixtures_dir)
    monkeypatch.setattr(settings, "use_fake_ssh", True)
