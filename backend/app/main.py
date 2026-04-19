"""FastAPI app factory + lifespan.

Starts the collector, log-tail, market WS, and metrics loop in the
background when the API starts, and shuts them down cleanly on exit.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes_dev import router as dev_router
from .api.routes_http import router as http_router
from .api.routes_ws import router as ws_router
from .collector.cache_poller import CachePoller
from .collector.log_tail import HealthLogTail
from .collector.ssh_client import make_transport
from .collector.vps_latency import VpsLatencyProbe
from .config import settings
from .logging import configure_logging, log
from .market.lighter_rest import fetch_candles_1m
from .market.lighter_ws import ws_client as market_ws
from .metrics.engine import metrics_loop
from .persistence.db import db
from .persistence import repos


async def _bootstrap_candles() -> None:
    """On cold start, fetch last 48h from REST and seed the candle table."""
    try:
        candles = await fetch_candles_1m(hours=48)
    except Exception as exc:  # noqa: BLE001
        log.warning("startup: REST candle bootstrap failed", error=str(exc))
        return
    for c in candles:
        await repos.upsert_candle(c)
    await repos.commit()
    log.info("startup: candles seeded", count=len(candles))


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    configure_logging()
    log.info("startup: begin")

    await db.connect()
    await _bootstrap_candles()

    transport = make_transport()
    await transport.connect()

    poller = CachePoller(transport)
    log_tail = HealthLogTail(transport)
    latency_probe = VpsLatencyProbe(transport)

    tasks = [
        asyncio.create_task(poller.run(), name="cache_poller"),
        asyncio.create_task(log_tail.run(), name="log_tail"),
        asyncio.create_task(market_ws.run(), name="market_ws"),
        asyncio.create_task(metrics_loop(), name="metrics_loop"),
        asyncio.create_task(latency_probe.run(), name="vps_latency"),
    ]
    log.info("startup: background tasks launched", count=len(tasks))
    try:
        yield
    finally:
        log.info("shutdown: cancelling tasks")
        market_ws.stop()
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await transport.close()
        await db.close()
        log.info("shutdown: done")


def create_app() -> FastAPI:
    app = FastAPI(title="Lighter HYPE Dashboard", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(http_router)
    app.include_router(ws_router)
    app.include_router(dev_router)
    return app


app = create_app()


def run() -> None:
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=False,
        log_config=None,
    )


if __name__ == "__main__":
    run()
