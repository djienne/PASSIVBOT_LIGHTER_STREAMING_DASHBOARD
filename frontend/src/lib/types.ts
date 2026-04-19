// Mirror of backend/app/models.py — keep in sync via SCHEMA_VERSION.

export type Side = "buy" | "sell";
export type PositionSide = "long" | "short" | "flat";
export type TimelineCategory = "trade" | "order" | "position" | "system";
export type WinLoss = "win" | "loss" | "neutral";

export interface Candle {
  t: number; o: number; h: number; l: number; c: number; v: number;
}

export interface FillEvent {
  event_id: string;
  ts: number;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  pnl: number;
  position_side: PositionSide;
  raw_id?: string | null;
}

export interface TimelineEvent {
  event_id: string;
  ts: number;
  category: TimelineCategory;
  label: string;
  side?: Side | null;
  price?: number | null;
  qty?: number | null;
  pnl?: number | null;
  win_loss: WinLoss;
  payload: Record<string, unknown>;
}

export interface MetricsSnapshot {
  ts: number;
  baseline: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  return_pct: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  sharpe: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  largest_win: number;
  largest_loss: number;
  exposure_pct: number;
  days_since_first_trade: number;
  days_since_last_trade: number;
  cagr: number;
  cagr_label: "projected" | "blended";
}

export interface HealthSnapshot {
  ts: number;
  vps_sync_age_ms: number | null;
  bot_uptime_seconds: number | null;
  bot_errors: number | null;
  bot_ws_reconnects: number | null;
  bot_rate_limits: number | null;
  ws_connected: boolean;
  backend_ok: boolean;
}

export interface PositionView {
  side: PositionSide;
  size: number;
  avg_entry: number;
  mark: number;
}

export interface BalanceSnapshot {
  snapshot_ts: number;
  balance: number;
  source: "health";
}

export interface OrderAggregate {
  snapshot_ts: number;
  orders_placed: number;
  orders_cancelled: number;
  fills_count: number;
}

export interface VpsLatencySnapshot {
  ts: number;
  region: string;
  target: string;
  avg_ms: number;
  min_ms: number | null;
  max_ms: number | null;
  jitter_ms: number | null;
  samples: number;
  method: "icmp" | "tcp";
}

export interface Bootstrap {
  schema_version: number;
  server_time: number;
  cursor: number;
  symbol: string;
  market_id: number;
  baseline: number;
  candles: Candle[];
  position: PositionView;
  balance: BalanceSnapshot | null;
  order_aggregate: OrderAggregate | null;
  metrics: MetricsSnapshot;
  timeline: TimelineEvent[];
  health: HealthSnapshot | null;
  vps_latency: VpsLatencySnapshot | null;
}

export type Envelope =
  | { v: number; type: "hello"; id: string; ts: number; cursor: number; data: { v: number } }
  | { v: number; type: "candle.update" | "candle.new"; id: string; ts: number; cursor: number; data: Candle }
  | { v: number; type: "fill"; id: string; ts: number; cursor: number; data: FillEvent }
  | { v: number; type: "timeline.append"; id: string; ts: number; cursor: number; data: TimelineEvent }
  | { v: number; type: "metrics.update"; id: string; ts: number; cursor: number; data: MetricsSnapshot }
  | { v: number; type: "health.update"; id: string; ts: number; cursor: number; data: HealthSnapshot | { ws_connected: boolean } }
  | { v: number; type: "balance.update"; id: string; ts: number; cursor: number; data: BalanceSnapshot }
  | { v: number; type: "order.update"; id: string; ts: number; cursor: number; data: OrderAggregate }
  | { v: number; type: "vps_latency.update"; id: string; ts: number; cursor: number; data: VpsLatencySnapshot }
  | { v: number; type: "error"; id: string; ts: number; cursor: number; data: Record<string, unknown> };
