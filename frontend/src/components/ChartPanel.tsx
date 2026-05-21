import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, ColorType, CrosshairMode,
  IChartApi, ISeriesApi, LineStyle, SeriesMarker, Time,
} from "lightweight-charts";
import { useDash } from "../lib/store";
import type { Candle, TimelineEvent } from "../lib/types";

const BG = "#05070d";
const GRID = "#111827";
const UP = "#34d399";
const DOWN = "#f87171";
const WICK = "#64748b";
const AVG_LINE = "#a78bfa";
const LIVE_CLOSE_LINE = "#60a5fa";
const ZOOM_TOGGLE_MS = 30_000;
const ZOOM_SEQUENCE = ["default", "zoomed", "twoday"] as const;

type VisibleRange = { from: Time; to: Time };
type ZoomMode = (typeof ZOOM_SEQUENCE)[number];

function toCandleData(c: Candle) {
  return { time: Math.floor(c.t / 1000) as Time, open: c.o, high: c.h, low: c.l, close: c.c };
}

function fillToMarker(ev: TimelineEvent): SeriesMarker<Time> | null {
  if (ev.category !== "trade" || !ev.price) return null;
  const time = Math.floor(ev.ts / 1000) as Time;
  if (ev.side === "buy") {
    return {
      time,
      position: "belowBar",
      color: UP,
      shape: "arrowUp",
      text: `+${ev.qty?.toFixed(2) ?? ""}`,
    };
  }
  const color = ev.win_loss === "win" ? UP : ev.win_loss === "loss" ? DOWN : "#a3a3a3";
  return {
    time,
    position: "aboveBar",
    color,
    shape: "arrowDown",
    text: ev.pnl != null ? (ev.pnl >= 0 ? `+$${ev.pnl.toFixed(2)}` : `-$${Math.abs(ev.pnl).toFixed(2)}`) : "",
  };
}

function computeTradeFocusedRanges(
  candles: Candle[],
  markers: SeriesMarker<Time>[],
): { defaultRange: VisibleRange; zoomedRange: VisibleRange; twoDayRange: VisibleRange } | null {
  if (candles.length === 0) return null;

  const MIN_SPAN_SECONDS = 90 * 60;
  const MAX_SPAN_SECONDS = 12 * 60 * 60;
  const PAD_FRACTION = 0.15;
  const RECENT_CLUSTER_N = 120;

  const firstCandle = Math.floor(candles[0].t / 1000);
  const lastCandle = Math.floor(candles[candles.length - 1].t / 1000);

  const insideCandles = markers
    .map(m => m.time as number)
    .filter(t => t >= firstCandle && t <= lastCandle)
    .sort((a, b) => a - b);
  const recent = insideCandles.slice(-RECENT_CLUSTER_N);

  let start: number;
  let end: number;
  if (recent.length > 0) {
    const mFirst = recent[0];
    const mLast = recent[recent.length - 1];
    let span = Math.max(mLast - mFirst, MIN_SPAN_SECONDS);
    span = Math.min(span, MAX_SPAN_SECONDS);
    const pad = Math.max(span * PAD_FRACTION, 5 * 60);
    end = Math.min(mLast + pad, lastCandle);
    start = Math.max(end - span - pad, firstCandle);
  } else {
    end = lastCandle;
    start = Math.max(lastCandle - 3 * 60 * 60, firstCandle);
  }

  const defaultSpan = Math.max(end - start, 30 * 60);
  const zoomedSpan = Math.max(
    Math.min(Math.floor(defaultSpan * 0.45), 90 * 60),
    45 * 60,
  );
  const zoomedStart = Math.max(end - zoomedSpan, firstCandle);
  const twoDayStart = Math.max(lastCandle - 48 * 60 * 60, firstCandle);

  return {
    defaultRange: { from: start as Time, to: end as Time },
    zoomedRange: { from: zoomedStart as Time, to: end as Time },
    twoDayRange: { from: twoDayStart as Time, to: lastCandle as Time },
  };
}

export default function ChartPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const avgEntryLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);
  const liveCloseLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("default");

  const candles = useDash(s => s.candles);
  const timeline = useDash(s => s.timeline);
  const position = useDash(s => s.position);
  const liveClose = candles.length > 0 ? candles[candles.length - 1].c : position.mark;

  const positionRef = useRef(position);
  positionRef.current = position;

  const markers = useMemo<SeriesMarker<Time>[]>(() => {
    const arr: SeriesMarker<Time>[] = [];
    for (const ev of timeline) {
      const m = fillToMarker(ev);
      if (m) arr.push(m);
    }
    arr.sort((a, b) => (a.time as number) - (b.time as number));
    return arr;
  }, [timeline]);

  const ranges = useMemo(() => computeTradeFocusedRanges(candles, markers), [candles, markers]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: BG }, textColor: "#cbd5e1", fontFamily: "Inter, system-ui" },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderColor: "#1e2638" },
      timeScale: { borderColor: "#1e2638", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    const series = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      wickUpColor: WICK,
      wickDownColor: WICK,
      borderVisible: false,
      priceLineVisible: false,
    });
    series.applyOptions({
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number }; margins?: unknown } | null) => {
        const base = original();
        if (!base) return base;
        const pos = positionRef.current;
        const extras: number[] = [];
        if (pos.avg_entry > 0) extras.push(pos.avg_entry);
        if (pos.mark > 0) extras.push(pos.mark);
        if (extras.length === 0) return base;
        return {
          ...base,
          priceRange: {
            minValue: Math.min(base.priceRange.minValue, ...extras),
            maxValue: Math.max(base.priceRange.maxValue, ...extras),
          },
        };
      },
    });
    chartRef.current = chart;
    candleSeriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      avgEntryLineRef.current = null;
      liveCloseLineRef.current = null;
    };
  }, []);

  const didInitialFitRef = useRef(false);
  useEffect(() => {
    const s = candleSeriesRef.current;
    if (!s || candles.length === 0) return;
    s.setData(candles.map(toCandleData));
    if (!didInitialFitRef.current) {
      chartRef.current?.timeScale().fitContent();
      didInitialFitRef.current = true;
    }
  }, [candles]);

  useEffect(() => {
    candleSeriesRef.current?.setMarkers(markers);
  }, [markers]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setZoomMode(prev => ZOOM_SEQUENCE[(ZOOM_SEQUENCE.indexOf(prev) + 1) % ZOOM_SEQUENCE.length]);
    }, ZOOM_TOGGLE_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ranges) return;
    const nextRange =
      zoomMode === "zoomed" ? ranges.zoomedRange :
      zoomMode === "twoday" ? ranges.twoDayRange :
      ranges.defaultRange;
    chart.timeScale().setVisibleRange(nextRange);
  }, [ranges, zoomMode]);

  useEffect(() => {
    const s = candleSeriesRef.current;
    if (!s) return;

    if (avgEntryLineRef.current) {
      s.removePriceLine(avgEntryLineRef.current);
      avgEntryLineRef.current = null;
    }
    if (position.avg_entry > 0 && position.size > 0) {
      avgEntryLineRef.current = s.createPriceLine({
        price: position.avg_entry,
        color: AVG_LINE,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "avg entry",
      });
    }

    if (liveCloseLineRef.current) {
      s.removePriceLine(liveCloseLineRef.current);
      liveCloseLineRef.current = null;
    }
    if (liveClose > 0) {
      liveCloseLineRef.current = s.createPriceLine({
        price: liveClose,
        color: LIVE_CLOSE_LINE,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        axisLabelColor: LIVE_CLOSE_LINE,
        axisLabelTextColor: BG,
        title: "",
      });
    }
  }, [position.avg_entry, position.size, liveClose]);

  return (
    <div className="pane relative overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/70 bg-panel/80 backdrop-blur flex-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img
              src="/hype_icon.png"
              alt="HYPE"
              className="h-5 w-5 rounded-full select-none shadow-[0_0_12px_rgba(140,242,220,0.2)]"
              draggable={false}
            />
            <span className="pane-heading">HYPE - 1m - auto zoom cycle</span>
          </div>
          <span className="text-subtle text-xs font-mono">
            {candles.length} candles - {markers.length} markers
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-subtle">
            {zoomMode === "zoomed" ? "detail view" : zoomMode === "twoday" ? "2 day view" : "context view"}
          </span>
          <LegendDot color={UP} label="entry" />
          <LegendDot color={DOWN} label="close" />
          <LegendDot color={AVG_LINE} label="avg entry" dashed />
          <LegendDot color={LIVE_CLOSE_LINE} label="live close" />
        </div>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}

function LegendDot({ color, label, dashed, dotted }: { color: string; label: string; dashed?: boolean; dotted?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-subtle">
      <span
        className="inline-block w-4 h-[2px] rounded"
        style={{
          background: dashed || dotted ? undefined : color,
          borderTop: dashed ? `2px dashed ${color}` : dotted ? `2px dotted ${color}` : undefined,
        }}
      />
      {label}
    </span>
  );
}
