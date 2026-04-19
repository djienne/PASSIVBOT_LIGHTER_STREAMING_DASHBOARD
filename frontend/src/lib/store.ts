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
        return { lastEventId: f.event_id };
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
