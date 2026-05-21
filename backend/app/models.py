"""Canonical domain models — the contract between the collector,
the metrics engine, the persistence layer, and the frontend.

All timestamps are UTC, in **milliseconds** since Unix epoch.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Side = Literal["buy", "sell"]
PositionSide = Literal["long", "short", "flat"]
TimelineCategory = Literal["trade", "order", "position", "system"]
WinLoss = Literal["win", "loss", "neutral"]
StartingCapitalSource = Literal[
    "manual",
    "config_fallback",
    "display_baseline_fallback",
    "code_fallback",
    "migration",
]


class Candle(BaseModel):
    model_config = ConfigDict(frozen=True)

    t: int = Field(description="open time (ms since epoch)")
    o: float
    h: float
    l: float
    c: float
    v: float = 0.0


class FillEvent(BaseModel):
    event_id: str
    ts: int
    symbol: str
    side: Side
    qty: float
    price: float
    pnl: float
    position_side: PositionSide
    raw_id: str | None = None


class OrderAggregate(BaseModel):
    """Aggregate counts from the bot's health line — we don't have per-order data."""

    snapshot_ts: int
    orders_placed: int
    orders_cancelled: int
    fills_count: int


class PositionSnapshot(BaseModel):
    snapshot_ts: int
    side: PositionSide
    size: float
    avg_entry: float
    source: Literal["fills", "health"] = "fills"


class BalanceSnapshot(BaseModel):
    snapshot_ts: int
    balance: float
    source: Literal["health"] = "health"


class StartingCapitalState(BaseModel):
    value: float
    source: StartingCapitalSource
    updated_ts: int | None = None
    note: str | None = None


class MetricsSnapshot(BaseModel):
    ts: int
    baseline: float
    realized_pnl: float
    unrealized_pnl: float
    total_pnl: float
    return_pct: float
    max_drawdown: float
    max_drawdown_pct: float
    sharpe: float
    win_rate: float
    avg_win: float
    avg_loss: float
    largest_win: float
    largest_loss: float
    exposure_pct: float
    days_since_first_trade: float
    days_since_last_trade: float
    total_volume_usd: float = 0.0
    opens_count: int = 0
    dca_count: int = 0
    closed_trades_count: int = 0
    cagr: float
    cagr_label: Literal["projected", "blended"] = "projected"


class HealthSnapshot(BaseModel):
    ts: int
    vps_sync_age_ms: int | None
    bot_uptime_seconds: int | None
    bot_errors: int | None
    bot_ws_reconnects: int | None
    bot_rate_limits: int | None
    ws_connected: bool
    backend_ok: bool = True


class VpsLatencySnapshot(BaseModel):
    ts: int
    region: str = "AWS Tokyo (ap-northeast-1)"
    target: str = "mainnet.zklighter.elliot.ai"
    avg_ms: float
    min_ms: float | None = None
    max_ms: float | None = None
    jitter_ms: float | None = None
    samples: int = 0
    method: Literal["icmp", "tcp"] = "icmp"


class FundingSnapshot(BaseModel):
    ts: int
    market_id: int
    current_rate_pct_hour: float
    annualized_apr_pct: float
    funding_timestamp: int | None = None


class FundingTotal(BaseModel):
    """Estimated total funding paid / received on HYPE since the bot's
    first fill, reconstructed from public REST data only.

    Positive values mean we paid net funding; negative values mean we
    received net funding. Accurate within rounding — does not account
    for intra-hour position changes, but hourly resolution matches
    Lighter's funding cadence so the error band is small.
    """
    ts: int
    start_ts: int
    total_paid_usd: float
    samples_count: int
    hours_covered: int
    method: Literal["rest_hourly"] = "rest_hourly"


class TimelineEvent(BaseModel):
    event_id: str
    ts: int
    category: TimelineCategory
    label: str
    side: Side | None = None
    price: float | None = None
    qty: float | None = None
    pnl: float | None = None
    win_loss: WinLoss = "neutral"
    payload: dict = Field(default_factory=dict)
