import { useEffect, useMemo, useRef } from "react";
import {
  createChart, ColorType, CrosshairMode,
  IChartApi, ISeriesApi, LineStyle, SeriesMarker, Time,
} from "lightweight-charts";
import { useDash } from "../lib/store";
import type { Candle, TimelineEvent } from "../lib/types";

const BG       = "#05070d";
const GRID     = "#111827";
const UP       = "#34d399";
const DOWN     = "#f87171";
const WICK     = "#64748b";
const AVG_LINE = "#a78bfa";
const MARK_LIN = "#60a5fa";

function toCandleData(c: Candle) {
  return { time: (Math.floor(c.t / 1000) as Time), open: c.o, high: c.h, low: c.l, close: c.c };
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
    text: ev.pnl != null ? (ev.pnl >= 0 ? `+$${ev.pnl.toFixed(2)}` : `−$${Math.abs(ev.pnl).toFixed(2)}`) : "",
  };
}

export default function ChartPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const avgEntryLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);
  const markLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);

  const candles = useDash(s => s.candles);
  const timeline = useDash(s => s.timeline);
  const position = useDash(s => s.position);
  // Keep the latest position values in a ref so the autoscaleInfoProvider
  // (which closes over its initial reference) always reads the live value.
  const positionRef = useRef(position);
  positionRef.current = position;

  const markers = useMemo<SeriesMarker<Time>[]>(() => {
    const arr: SeriesMarker<Time>[] = [];
    for (const ev of timeline) {
      const m = fillToMarker(ev);
      if (m) arr.push(m);
    }
    // Markers must be in ascending time order.
    arr.sort((a, b) => (a.time as number) - (b.time as number));
    return arr;
  }, [timeline]);

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
      upColor: UP, downColor: DOWN, wickUpColor: WICK, wickDownColor: WICK,
      borderVisible: false, priceLineVisible: false,
    });
    // Extend the price axis so the avg-entry + mark price lines always
    // land inside the viewport — otherwise tight zooms can push them off.
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
      markLineRef.current = null;
    };
  }, []);

  // Keep candle data fresh. Don't blow away the visible range on every tick —
  // only fit-content on the initial data load so live candle updates don't
  // snap the chart back to "show everything" every second.
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

  // Markers.
  useEffect(() => {
    candleSeriesRef.current?.setMarkers(markers);
  }, [markers]);

  // Auto-zoom: focus the visible range on the densest cluster of recent
  // trading activity rather than flatlining across whatever window the
  // candle bootstrap happens to cover.
  //
  // Strategy:
  //   1) Consider only the N most recent markers that actually fall inside
  //      the candle window. Using the full timeline would pull min() way
  //      back in history (timeline holds 200 events spanning 30 days; the
  //      chart only has ~48 h of candles, so all those old markers get
  //      clamped to firstCandle and the "zoom" becomes a no-op).
  //   2) Span = max(lastMarker - firstMarker, MIN_SPAN). Pad by 12 %.
  //   3) Hard-cap the window at MAX_SPAN so a cluster of early entries +
  //      one lonely recent close can't drag the chart all the way out.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;

    const MIN_SPAN_SECONDS = 90 * 60;             // floor:   1.5 h (keeps context)
    const MAX_SPAN_SECONDS = 12 * 60 * 60;        // ceiling: 12 h
    const PAD_FRACTION     = 0.15;
    const RECENT_CLUSTER_N = 120;                 // last ~120 markers drive the zoom

    const firstCandle = Math.floor(candles[0].t / 1000);
    const lastCandle  = Math.floor(candles[candles.length - 1].t / 1000);

    const insideCandles = markers
      .map(m => m.time as number)
      .filter(t => t >= firstCandle && t <= lastCandle)
      .sort((a, b) => a - b);
    const recent = insideCandles.slice(-RECENT_CLUSTER_N);

    let start: number;
    let end: number;
    if (recent.length > 0) {
      const mFirst = recent[0];
      const mLast  = recent[recent.length - 1];
      let span = Math.max(mLast - mFirst, MIN_SPAN_SECONDS);
      span = Math.min(span, MAX_SPAN_SECONDS);
      const pad = Math.max(span * PAD_FRACTION, 5 * 60);
      // Anchor on the most recent marker (we want "now" visible), then
      // extend back to cover the cluster.
      end   = Math.min(mLast + pad, lastCandle);
      start = Math.max(end - span - pad, firstCandle);
    } else {
      // No markers in the candle window — show the last 3 h by default.
      end   = lastCandle;
      start = Math.max(lastCandle - 3 * 60 * 60, firstCandle);
    }
    chart.timeScale().setVisibleRange({ from: start as Time, to: end as Time });
  }, [markers, candles]);

  // Avg-entry + mark price horizontal lines.
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

    if (markLineRef.current) {
      s.removePriceLine(markLineRef.current);
      markLineRef.current = null;
    }
    if (position.mark > 0) {
      markLineRef.current = s.createPriceLine({
        price: position.mark,
        color: MARK_LIN,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "mark",
      });
    }
  }, [position.avg_entry, position.size, position.mark]);

  return (
    <div className="pane relative overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/70 bg-panel/80 backdrop-blur flex-none">
        <div className="flex items-center gap-3">
          <span className="pane-heading">HYPE · 1m · zoomed to trades</span>
          <span className="text-subtle text-xs font-mono">
            {candles.length} candles · {markers.length} markers
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <LegendDot color={UP} label="entry" />
          <LegendDot color={DOWN} label="close" />
          <LegendDot color={AVG_LINE} label="avg entry" dashed />
          <LegendDot color={MARK_LIN} label="mark" dotted />
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
