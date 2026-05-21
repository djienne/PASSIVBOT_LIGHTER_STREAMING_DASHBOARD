"""FastAPI app factory + lifespan.

Starts the collector, log-tail, market WS, and metrics loop in the
background when the API starts, and shuts them down cleanly on exit.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .api.routes_http import router as http_router
from .api.routes_ws import router as ws_router
from .collector.cache_poller import CachePoller
from .collector.funding_total import estimator as funding_total_estimator
from .collector.log_tail import HealthLogTail
from .collector.ssh_client import SSHTransport, make_transport
from .collector.trade_classifier import timeline_events_from_fills
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
    async with repos.transaction():
        for c in candles:
            await repos.upsert_candle(c)
    log.info("startup: candles seeded", count=len(candles))


async def _reconcile_trade_timeline() -> None:
    """Backfill position-aware trade labels/payloads for existing fills."""
    async with repos.transaction():
        fills = await repos.all_fills()
        if not fills:
            return
        events = timeline_events_from_fills(fills)
        updated = await repos.update_trade_timeline_events(events.values())
    if updated:
        log.info("startup: trade timeline reconciled", count=updated)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    configure_logging()
    log.info("startup: begin")

    await db.connect()
    await _reconcile_trade_timeline()
    await _bootstrap_candles()

    tasks = [
        asyncio.create_task(market_ws.run(), name="market_ws"),
        asyncio.create_task(metrics_loop(), name="metrics_loop"),
        asyncio.create_task(funding_total_estimator.run(), name="funding_total"),
    ]
    transport: SSHTransport | None = None
    if settings.ssh_target_configured:
        transport = make_transport()
        if settings.require_ssh_on_start:
            await transport.connect()
        else:
            log.info("startup: SSH will connect from collector tasks")

        poller = CachePoller(transport)
        log_tail = HealthLogTail(transport)
        latency_probe = VpsLatencyProbe(transport)
        tasks.extend([
            asyncio.create_task(poller.run(), name="cache_poller"),
            asyncio.create_task(log_tail.run(), name="log_tail"),
            asyncio.create_task(latency_probe.run(), name="vps_latency"),
        ])
    else:
        log.warning(
            "startup: VPS_HOST is not configured; SSH collectors and VPS latency are disabled",
            vps_host=settings.vps_host,
        )
    log.info("startup: background tasks launched", count=len(tasks))
    try:
        yield
    finally:
        log.info("shutdown: cancelling tasks")
        market_ws.stop()
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if transport is not None:
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
    if settings.enable_dev_routes:
        from .api.routes_dev import router as dev_router

        app.include_router(dev_router)
    _mount_api_not_found(app)
    _mount_frontend(app)
    return app


def _mount_api_not_found(app: FastAPI) -> None:
    @app.api_route(
        "/api/{full_path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
        include_in_schema=False,
    )
    async def api_not_found(full_path: str) -> None:  # noqa: ARG001
        raise HTTPException(status_code=404)


def _mount_frontend(app: FastAPI) -> None:
    dist = settings.frontend_dist
    index = dist / "index.html"
    if not index.is_file():
        log.warning("frontend: dist index not found; static UI disabled", path=str(index))
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        if full_path == "ws" or full_path.startswith(("api/", "ws/")):
            raise HTTPException(status_code=404)

        requested = (dist / full_path).resolve()
        try:
            requested.relative_to(dist.resolve())
        except ValueError:
            raise HTTPException(status_code=404) from None
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(index)


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
