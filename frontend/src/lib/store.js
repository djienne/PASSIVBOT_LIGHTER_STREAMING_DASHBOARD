import { create } from "zustand";
const MAX_TIMELINE = 200;
export const useDash = create((set) => ({
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
                const c = e.data;
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
                const f = e.data;
                return { lastEventId: f.event_id };
            }
            case "timeline.append": {
                const ev = e.data;
                if (state.timeline.find(x => x.event_id === ev.event_id))
                    return {};
                const next = [ev, ...state.timeline].slice(0, MAX_TIMELINE);
                return { timeline: next, lastEventId: ev.event_id, cursor: Math.max(state.cursor, e.cursor) };
            }
            case "metrics.update":
                return { metrics: e.data };
            case "balance.update":
                return { balance: e.data };
            case "order.update":
                return { orderAggregate: e.data };
            case "health.update": {
                const d = e.data;
                if ("ts" in d)
                    return { health: d };
                if ("ws_connected" in d && state.health) {
                    return { health: { ...state.health, ws_connected: d.ws_connected } };
                }
                return {};
            }
            case "vps_latency.update":
                return { vpsLatency: e.data };
            default:
                return {};
        }
    }),
    setWSStatus: (s) => set({ wsStatus: s }),
}));
