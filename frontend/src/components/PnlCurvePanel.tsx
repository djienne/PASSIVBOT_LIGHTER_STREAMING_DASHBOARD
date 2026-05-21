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
import type { AutoscaleInfoProvider } from "lightweight-charts";
import { useDash } from "../lib/store";
import { fetchPnlCurve } from "../lib/api";
import { fmtPct, polarity } from "../lib/format";
import {
  formatSignedQuoteAmount,
  formatTradePnl,
  formatTradeQty,
  tradeAction,
} from "../lib/tradeLabels";
import type { PnlCurvePoint, Side, TimelineEvent } from "../lib/types";

const BG = "#05070d";
const GRID = "#111827";
const DOLLAR_LINE = "#60a5fa";
const FILL_AREA = "rgba(96, 165, 250, 0.12)";
const ZERO_LINE = "#334155";
const BUY_DOT = "#34d399";
const SELL_DOT = "#f87171";

type CurvePoint = { time: Time; value: number };
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
  let cum = 0;
  let lastBucket: number | null = null;
  let buyCount = 0;
  let sellCount = 0;

  for (const ev of trades) {
    cum += ev.pnl ?? 0;
    const bucket = Math.floor(ev.ts / 1000);
    const time = bucket as Time;
    const isBuy = ev.side === "buy";
    const marker: SeriesMarker<Time> = {
      time,
      position: isBuy ? "belowBar" : "aboveBar",
      color: isBuy ? BUY_DOT : SELL_DOT,
      shape: "circle",
      text: markerText(ev, symbol),
    };

    if (isBuy) {
      buyCount += 1;
    } else if (ev.side === "sell") {
      sellCount += 1;
    }

    if (bucket === lastBucket) {
      dollar[dollar.length - 1] = { time, value: cum };
      markers[markers.length - 1] = marker;
      continue;
    }

    dollar.push({ time, value: cum });
    markers.push(marker);
    lastBucket = bucket;
  }

  return { dollar, markers, buyCount, sellCount };
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

export default function PnlCurvePanel() {
  const timeline = useDash(s => s.timeline);
  const baseline = useDash(s => s.baseline);
  const metrics = useDash(s => s.metrics);
  const symbol = useDash(s => s.symbol);
  const [history, setHistory] = useState<PnlCurvePoint[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const dollarSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const zeroLineRef = useRef<ReturnType<ISeriesApi<"Area">["createPriceLine"]> | null>(null);

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

    zeroLineRef.current = dollarSeries.createPriceLine({
      price: 0,
      color: ZERO_LINE,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: "",
    });

    chartRef.current = chart;
    dollarSeriesRef.current = dollarSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      dollarSeriesRef.current = null;
      zeroLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!dollarSeriesRef.current) return;
    dollarSeriesRef.current.setData(curves.dollar);
    dollarSeriesRef.current.setMarkers(curves.markers);
    chartRef.current?.timeScale().fitContent();
  }, [curves]);

  const totalDollar = curves.dollar.length ? curves.dollar[curves.dollar.length - 1].value : 0;
  const totalPct = baseline > 0 ? (totalDollar / baseline) * 100 : 0;
  const tone = polarity(totalDollar);
  const toneClass = tone === "pos" ? "text-bull" : tone === "neg" ? "text-bear" : "text-text";
  const fillCount = curves.buyCount + curves.sellCount;
  const hasClosedTrade = curves.sellCount > 0;

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
            USDC curve
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
      {!hasClosedTrade && (
        <div className="absolute inset-x-0 bottom-6 pointer-events-none text-center text-xs font-mono text-subtle">
          waiting for closed trade
        </div>
      )}
    </div>
  );
}
