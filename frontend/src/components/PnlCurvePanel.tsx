import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineStyle,
  SeriesMarker,
  Time,
} from "lightweight-charts";
import type { AutoscaleInfoProvider, MouseEventParams } from "lightweight-charts";
import { useDash } from "../lib/store";
import { fetchEquityCurve, fetchPnlCurve } from "../lib/api";
import { fmtPct, polarity } from "../lib/format";
import {
  formatSignedQuoteAmount,
  formatTradePnl,
  formatTradeQty,
  tradeAction,
} from "../lib/tradeLabels";
import type { EquityCurvePoint, MetricsSnapshot, PnlCurvePoint, Side, TimelineEvent } from "../lib/types";

const BG = "#05070d";
const GRID = "#111827";
const DOLLAR_LINE = "#60a5fa";
const FILL_AREA = "rgba(96, 165, 250, 0.12)";
const ZERO_LINE = "#334155";
const BUY_DOT = "#34d399";
const SELL_DOT = "#f87171";
const MTM_LINE = "#a78bfa";

type CurvePoint = { time: Time; value: number };
type MarkerDetail = {
  id: string;
  ts: number;
  label: string;
  side?: Side | null;
  pnl?: number | null;
  color: string;
};
type CurveTrade = {
  event_id: string;
  ts: number;
  side?: Side | null;
  price?: number | null;
  qty?: number | null;
  pnl?: number | null;
  payload?: TimelineEvent["payload"];
};

function asTradeEvent(
  ev: CurveTrade,
  symbol: string,
): Pick<TimelineEvent, "category" | "label" | "side" | "qty" | "price" | "pnl" | "payload"> {
  return {
    category: "trade",
    label: "",
    side: ev.side ?? null,
    qty: ev.qty ?? null,
    price: ev.price ?? null,
    pnl: ev.pnl ?? null,
    payload: ev.payload ?? { symbol },
  };
}

function markerText(ev: CurveTrade, symbol: string): string | undefined {
  const trade = asTradeEvent(ev, symbol);
  const qty = formatTradeQty(trade);
  const pnl = formatTradePnl(trade);

  if (ev.side === "buy") {
    const action = tradeAction(trade) === "dca" ? "DCA" : "ENTRY";
    return qty ? `${action} ${qty}` : action;
  }

  if (ev.side === "sell") {
    const action = tradeAction(trade) === "partial_exit" ? "PART EXIT" : "CLOSED";
    return pnl ? `${action} ${pnl}` : action;
  }

  return undefined;
}

function buildCurves(tradesInput: CurveTrade[], symbol: string): {
  dollar: CurvePoint[];
  markers: SeriesMarker<Time>[];
  markerDetails: Map<string, MarkerDetail>;
  buyCount: number;
  sellCount: number;
} {
  // Live timeline is newest-first; PnL curve needs chronological order.
  // Lightweight-Charts uses second-granularity time keys; multiple fills in the
  // same second must be merged or setData throws "data must be asc ordered".
  const trades = tradesInput
    .filter(ev => ev.pnl != null)
    .slice()
    .sort((a, b) => a.ts - b.ts);
  const dollar: CurvePoint[] = [];
  const markers: SeriesMarker<Time>[] = [];
  const markerDetails = new Map<string, MarkerDetail>();
  let cum = 0;
  let lastBucket: number | null = null;
  let lastMarkerId: string | null = null;
  let buyCount = 0;
  let sellCount = 0;

  for (const ev of trades) {
    cum += ev.pnl ?? 0;
    const bucket = Math.floor(ev.ts / 1000);
    const time = bucket as Time;
    const isBuy = ev.side === "buy";
    const markerId = `pnl:${ev.event_id}`;
    const markerColor = isBuy ? BUY_DOT : SELL_DOT;
    const label = markerText(ev, symbol) ?? (isBuy ? "ENTRY" : ev.side === "sell" ? "CLOSED" : "TRADE");
    const marker: SeriesMarker<Time> = {
      id: markerId,
      time,
      position: isBuy ? "belowBar" : "aboveBar",
      color: markerColor,
      shape: "circle",
      size: 1.2,
    };
    const detail: MarkerDetail = {
      id: markerId,
      ts: ev.ts,
      label,
      side: ev.side,
      pnl: ev.pnl,
      color: markerColor,
    };

    if (isBuy) {
      buyCount += 1;
    } else if (ev.side === "sell") {
      sellCount += 1;
    }

    if (bucket === lastBucket) {
      dollar[dollar.length - 1] = { time, value: cum };
      if (lastMarkerId) markerDetails.delete(lastMarkerId);
      markers[markers.length - 1] = marker;
      markerDetails.set(markerId, detail);
      lastMarkerId = markerId;
      continue;
    }

    dollar.push({ time, value: cum });
    markers.push(marker);
    markerDetails.set(markerId, detail);
    lastBucket = bucket;
    lastMarkerId = markerId;
  }

  return { dollar, markers, markerDetails, buyCount, sellCount };
}

// Mark-to-market total PnL (realized + unrealized) sampled from the persisted
// 5-minute snapshots, with a live tail point from the current metrics so the line
// tracks the open position between snapshots. Plotted on the same zero-centered
// axis as the realized curve, so the gap between the two lines = unrealized PnL.
function buildMtmCurve(points: EquityCurvePoint[], live: MetricsSnapshot | null): CurvePoint[] {
  const sorted = points.slice().sort((a, b) => a.ts - b.ts);
  const out: CurvePoint[] = [];
  let lastBucket: number | null = null;
  // Lightweight-Charts uses second-granularity time keys; collapse same-second
  // samples to the latest so setData doesn't throw "data must be asc ordered".
  for (const p of sorted) {
    const bucket = Math.floor(p.ts / 1000);
    if (bucket === lastBucket) {
      out[out.length - 1] = { time: bucket as Time, value: p.total_pnl };
      continue;
    }
    out.push({ time: bucket as Time, value: p.total_pnl });
    lastBucket = bucket;
  }
  if (live) {
    const bucket = Math.floor(live.ts / 1000);
    if (lastBucket == null || bucket > lastBucket) {
      out.push({ time: bucket as Time, value: live.total_pnl });
    } else if (bucket === lastBucket) {
      out[out.length - 1] = { time: bucket as Time, value: live.total_pnl };
    }
  }
  return out;
}

function paddedAutoscale(baseRange: { minValue: number; maxValue: number }): { minValue: number; maxValue: number } {
  const min = Math.min(baseRange.minValue, 0);
  const max = Math.max(baseRange.maxValue, 0);
  const magnitude = Math.max(Math.abs(min), Math.abs(max), 0.1);
  return {
    minValue: Math.min(min, -magnitude * 0.25),
    maxValue: Math.max(max, magnitude * 1.15),
  };
}

const pnlAutoscaleInfoProvider: AutoscaleInfoProvider = original => {
  const base = original();
  if (!base) return base;
  return {
    ...base,
    priceRange: paddedAutoscale(base.priceRange),
  };
};

function formatMarkerTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PnlCurvePanel() {
  const timeline = useDash(s => s.timeline);
  const baseline = useDash(s => s.baseline);
  const metrics = useDash(s => s.metrics);
  const symbol = useDash(s => s.symbol);
  const [history, setHistory] = useState<PnlCurvePoint[]>([]);
  const [equityHistory, setEquityHistory] = useState<EquityCurvePoint[]>([]);
  const [hoveredTrade, setHoveredTrade] = useState<MarkerDetail | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const dollarSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const mtmSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const zeroLineRef = useRef<ReturnType<ISeriesApi<"Area">["createPriceLine"]> | null>(null);
  const markerDetailsRef = useRef<Map<string, MarkerDetail>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const curve = await fetchPnlCurve();
        if (!cancelled) setHistory(curve.points);
      } catch {
        // Fall back to the bootstrapped live timeline if the endpoint is unavailable.
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const curve = await fetchEquityCurve();
        if (!cancelled) setEquityHistory(curve.points);
      } catch {
        // No persisted snapshots yet, or endpoint unavailable: the live metrics
        // tail alone still draws a (short) mark-to-market line.
      }
    };
    load();
    // Refresh the persisted 5-min points so a long-open session stays current.
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const tradeEvents = useMemo<CurveTrade[]>(() => {
    const byId = new Map<string, CurveTrade>();
    for (const point of history) {
      byId.set(point.event_id, point);
    }
    for (const ev of timeline) {
      if (ev.category !== "trade" || ev.pnl == null) continue;
      const existing = byId.get(ev.event_id);
      byId.set(ev.event_id, existing ? { ...existing, ...ev } : ev);
    }
    return Array.from(byId.values());
  }, [history, timeline]);

  const curves = useMemo(() => buildCurves(tradeEvents, symbol), [tradeEvents, symbol]);
  const mtmCurve = useMemo(() => buildMtmCurve(equityHistory, metrics), [equityHistory, metrics]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: "#cbd5e1",
        fontFamily: "Inter, system-ui",
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: {
        borderColor: "#1e2638",
        visible: true,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      leftPriceScale: { borderColor: "#1e2638", visible: false },
      timeScale: { borderColor: "#1e2638", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    const dollarSeries = chart.addAreaSeries({
      lineColor: DOLLAR_LINE,
      topColor: FILL_AREA,
      bottomColor: "rgba(96, 165, 250, 0.0)",
      lineWidth: 2,
      priceScaleId: "right",
      priceFormat: {
        type: "custom",
        formatter: (value: number) => formatSignedQuoteAmount(value) ?? "0.00 USDC",
      },
      autoscaleInfoProvider: pnlAutoscaleInfoProvider,
    });

    const mtmSeries = chart.addLineSeries({
      color: MTM_LINE,
      lineWidth: 2,
      priceScaleId: "right",
      priceFormat: {
        type: "custom",
        formatter: (value: number) => formatSignedQuoteAmount(value) ?? "0.00 USDC",
      },
      autoscaleInfoProvider: pnlAutoscaleInfoProvider,
      crosshairMarkerVisible: false,
    });

    zeroLineRef.current = dollarSeries.createPriceLine({
      price: 0,
      color: ZERO_LINE,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: "",
    });

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      const markerId = typeof param.hoveredObjectId === "string" ? param.hoveredObjectId : null;
      const next = markerId ? markerDetailsRef.current.get(markerId) ?? null : null;
      setHoveredTrade(current => (current?.id === next?.id ? current : next));
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    chartRef.current = chart;
    dollarSeriesRef.current = dollarSeries;
    mtmSeriesRef.current = mtmSeries;

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      dollarSeriesRef.current = null;
      mtmSeriesRef.current = null;
      zeroLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    markerDetailsRef.current = curves.markerDetails;
    setHoveredTrade(current => {
      if (!current) return current;
      return curves.markerDetails.has(current.id) ? current : null;
    });
  }, [curves.markerDetails]);

  useEffect(() => {
    if (!dollarSeriesRef.current) return;
    dollarSeriesRef.current.setData(curves.dollar);
    dollarSeriesRef.current.setMarkers(curves.markers);
    chartRef.current?.timeScale().fitContent();
  }, [curves]);

  useEffect(() => {
    // No fitContent() here: the realized-curve effect above handles the view fit on
    // trade changes; refitting on every ~3s metrics tick would reset the user's pan.
    mtmSeriesRef.current?.setData(mtmCurve);
  }, [mtmCurve]);

  const totalDollar = curves.dollar.length ? curves.dollar[curves.dollar.length - 1].value : 0;
  const totalPct = baseline > 0 ? (totalDollar / baseline) * 100 : 0;
  const tone = polarity(totalDollar);
  const toneClass = tone === "pos" ? "text-bull" : tone === "neg" ? "text-bear" : "text-text";
  const fillCount = curves.buyCount + curves.sellCount;
  const hasClosedTrade = curves.sellCount > 0;
  const hoveredToneClass = hoveredTrade?.side === "buy"
    ? "text-bull"
    : (hoveredTrade?.pnl ?? 0) < 0
      ? "text-bear"
      : "text-bull";

  return (
    <div className="pane relative overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/70 bg-panel/80 backdrop-blur flex-none">
        <div className="flex items-center gap-3 min-w-0">
          <span className="pane-heading whitespace-nowrap">realized PnL</span>
          <span className="text-subtle text-xs font-mono truncate">
            {fillCount} fills - {curves.buyCount} entries / {curves.sellCount} closes
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="hidden 2xl:flex items-center gap-1.5 text-subtle">
            <span className="inline-block w-3 h-[2px]" style={{ background: DOLLAR_LINE }} />
            realized
          </span>
          <span className="hidden 2xl:flex items-center gap-1.5 text-subtle">
            <span className="inline-block w-3 h-[2px]" style={{ background: MTM_LINE }} />
            mark-to-market
          </span>
          <span className="hidden xl:inline text-subtle">
            vs {baseline.toFixed(2)} USDC start
          </span>
          <span className="flex items-center gap-1.5 text-subtle">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: BUY_DOT }} />
            entry
          </span>
          <span className="flex items-center gap-1.5 text-subtle">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: SELL_DOT }} />
            close
          </span>
        </div>
      </div>
      <div className="px-4 pt-2 flex items-baseline gap-3 flex-none">
        <span className={`metric-value text-2xl ${toneClass}`}>
          {formatSignedQuoteAmount(totalDollar) ?? "0.00 USDC"}
        </span>
        <span className={`text-sm font-mono ${toneClass}`}>{fmtPct(totalPct, 2)}</span>
        {metrics && metrics.max_drawdown < 0 && (
          <span className="text-xs font-mono text-subtle ml-auto">
            peak dd {formatSignedQuoteAmount(metrics.max_drawdown) ?? "0.00 USDC"} ({fmtPct(metrics.max_drawdown_pct)})
          </span>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
      {hoveredTrade && (
        <div
          className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-[calc(100%-2rem)] rounded-md border bg-bg/95 px-3 py-2 shadow-lg backdrop-blur"
          style={{ borderColor: hoveredTrade.color }}
        >
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: hoveredTrade.color }} />
            <span className={hoveredToneClass}>{hoveredTrade.label}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] font-mono uppercase text-subtle">
            <span>{formatMarkerTime(hoveredTrade.ts)}</span>
            {hoveredTrade.side && <span>{hoveredTrade.side}</span>}
          </div>
        </div>
      )}
      {!hasClosedTrade && (
        <div className="absolute inset-x-0 bottom-6 pointer-events-none text-center text-xs font-mono text-subtle">
          waiting for closed trade
        </div>
      )}
    </div>
  );
}
