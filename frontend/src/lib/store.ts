import { create } from "zustand";
import type {
  BalanceSnapshot, Bootstrap, Candle, Envelope, FillEvent,
  HealthSnapshot, MetricsSnapshot, OrderAggregate, PositionView, TimelineEvent,
  VpsLatencySnapshot,
} from "./types";

export interface DashState {
  schemaVersion: number;
  cursor: number;
  serverTimeOffsetMs: number;
  symbol: string;
  marketId: number;
  baseline: number;

  candles: Candle[];
  candlesDirty: number; // monotonic counter — chart listens for updates

  position: PositionView;
  balance: BalanceSnapshot | null;
  orderAggregate: OrderAggregate | null;
  metrics: MetricsSnapshot | null;

  timeline: TimelineEvent[];
  lastEventId: string | null;

  health: HealthSnapshot | null;
  vpsLatency: VpsLatencySnapshot | null;
  wsStatus: "idle" | "connecting" | "open" | "closed";

  applyBootstrap: (b: Bootstrap) => void;
  applyEnvelope: (e: Envelope) => void;
  setWSStatus: (s: DashState["wsStatus"]) => void;
}

const MAX_TIMELINE = 200;

function nextPositionFromFill(position: PositionView, fill: FillEvent): PositionView {
  let size = position.size;
  let avgEntry = position.avg_entry;

  if (fill.side === "buy") {
    const newSize = size + fill.qty;
    avgEntry = newSize > 0
      ? ((size * avgEntry) + (fill.qty * fill.price)) / newSize
      : fill.price;
    size = newSize;
  } else {
    size = Math.max(0, size - Math.min(fill.qty, size));
    if (size <= 1e-9) {
      size = 0;
      avgEntry = 0;
    }
  }

  return {
    ...position,
    side: size > 0 ? "long" : "flat",
    size: Number(size.toFixed(8)),
    avg_entry: avgEntry,
  };
}

function patchMetricsFromFill(
  metrics: MetricsSnapshot | null,
  nextPosition: PositionView,
  baseline: number,
  fill: FillEvent,
): MetricsSnapshot | null {
  if (!metrics) return null;

  const realized = metrics.realized_pnl + fill.pnl;
  const unrealized = nextPosition.size > 0
    ? (nextPosition.mark - nextPosition.avg_entry) * nextPosition.size
    : 0;
  const total = realized + unrealized;

  return {
    ...metrics,
    realized_pnl: realized,
    unrealized_pnl: unrealized,
    total_pnl: total,
    return_pct: baseline > 0 ? (total / baseline) * 100 : 0,
    days_since_last_trade: Math.max(0, (Date.now() - fill.ts) / 86_400_000),
    ts: Math.max(metrics.ts, fill.ts),
  };
}

export const useDash = create<DashState>((set) => ({
  schemaVersion: 1,
  cursor: 0,
  serverTimeOffsetMs: 0,
  symbol: "HYPE",
  marketId: 24,
  baseline: 800,

  candles: [],
  candlesDirty: 0,

  position: { side: "flat", size: 0, avg_entry: 0, mark: 0 },
  balance: null,
  orderAggregate: null,
  metrics: null,

  timeline: [],
  lastEventId: null,

  health: null,
  vpsLatency: null,
  wsStatus: "idle",

  applyBootstrap: (b) => set(() => ({
    schemaVersion: b.schema_version,
    cursor: b.cursor,
    serverTimeOffsetMs: b.server_time - Date.now(),
    symbol: b.symbol,
    marketId: b.market_id,
    baseline: b.baseline,
    candles: b.candles,
    candlesDirty: Date.now(),
    position: b.position,
    balance: b.balance,
    orderAggregate: b.order_aggregate,
    metrics: b.metrics,
    timeline: b.timeline,
    health: b.health,
    vpsLatency: b.vps_latency,
  })),

  applyEnvelope: (e) => set((state) => {
    switch (e.type) {
      case "hello":
        return { schemaVersion: e.data.v };
      case "candle.update":
      case "candle.new": {
        const c = e.data as Candle;
        // Mirror the candle's latest close into the position snapshot so the
        // Position panel and TopStrip derive unrealized PnL from the same
        // live mark rather than the bootstrap-time snapshot.
        const nextPosition = state.position.mark !== c.c
          ? { ...state.position, mark: c.c }
          : state.position;
        const last = state.candles[state.candles.length - 1];
        if (!last || c.t > last.t) {
          return {
            candles: [...state.candles, c].slice(-4000),
            candlesDirty: Date.now(),
            position: nextPosition,
          };
        }
        if (c.t === last.t) {
          const nextCandles = state.candles.slice(0, -1);
          nextCandles.push(c);
          return { candles: nextCandles, candlesDirty: Date.now(), position: nextPosition };
        }
        return { position: nextPosition };
      }
      case "fill": {
        const f = e.data as FillEvent;
        const nextPosition = nextPositionFromFill(state.position, f);
        const nextMetrics = patchMetricsFromFill(state.metrics, nextPosition, state.baseline, f);
        return nextMetrics
          ? { lastEventId: f.event_id, position: nextPosition, metrics: nextMetrics }
          : { lastEventId: f.event_id, position: nextPosition };
      }
      case "timeline.append": {
        const ev = e.data as TimelineEvent;
        if (state.timeline.find(x => x.event_id === ev.event_id)) return {};
        const next = [ev, ...state.timeline].slice(0, MAX_TIMELINE);
        return { timeline: next, lastEventId: ev.event_id, cursor: Math.max(state.cursor, e.cursor) };
      }
      case "metrics.update":
        return { metrics: e.data as MetricsSnapshot };
      case "balance.update":
        return { balance: e.data as BalanceSnapshot };
      case "order.update":
        return { orderAggregate: e.data as OrderAggregate };
      case "health.update": {
        const d = e.data as unknown as (HealthSnapshot | { ws_connected: boolean });
        if ("ts" in d) return { health: d };
        if ("ws_connected" in d && state.health) {
          return { health: { ...state.health, ws_connected: d.ws_connected } };
        }
        return {};
      }
      case "vps_latency.update":
        return { vpsLatency: e.data as VpsLatencySnapshot };
      default:
        return {};
    }
  }),

  setWSStatus: (s) => set({ wsStatus: s }),
}));
