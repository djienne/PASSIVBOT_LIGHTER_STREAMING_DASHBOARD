import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, ColorType, CrosshairMode,
  IChartApi, ISeriesApi, LineStyle, SeriesMarker, Time,
} from "lightweight-charts";
import { useDash } from "../lib/store";
import type { Candle, TimelineEvent } from "../lib/types";
import { tradeMarkerLines, tradeMarkerText } from "../lib/tradeLabels";
import { fmtPct, polarity } from "../lib/format";

const BG = "#05070d";
const GRID = "#111827";
const UP = "#34d399";
const DOWN = "#f87171";
const WICK = "#64748b";
const AVG_LINE = "#a78bfa";
const ZOOM_TOGGLE_MS = 30_000;
const ZOOM_SEQUENCE = ["default", "zoomed", "twoday"] as const;

type VisibleRange = { from: Time; to: Time };
type ZoomMode = (typeof ZOOM_SEQUENCE)[number];

function toCandleData(c: Candle) {
  return { time: Math.floor(c.t / 1000) as Time, open: c.o, high: c.h, low: c.l, close: c.c };
}

function fillToMarkers(ev: TimelineEvent): SeriesMarker<Time>[] {
  if (ev.category !== "trade" || !ev.price) return [];
  const time = Math.floor(ev.ts / 1000) as Time;
  if (ev.side === "buy") {
    return [{
      time,
      position: "belowBar",
      color: UP,
      shape: "arrowUp",
      id: `${ev.event_id}:entry`,
      text: tradeMarkerText(ev),
    }];
  }
  const color = ev.win_loss === "win" ? UP : ev.win_loss === "loss" ? DOWN : "#a3a3a3";
  const lines = tradeMarkerLines(ev);
  if (lines.length <= 1) {
    return [{
      time,
      position: "aboveBar",
      color,
      shape: "arrowDown",
      id: `${ev.event_id}:exit`,
      text: lines[0] ?? tradeMarkerText(ev),
    }];
  }
  return [
    {
      time,
      position: "aboveBar",
      color,
      shape: "arrowDown",
      id: `${ev.event_id}:exit-shape`,
    },
    ...[...lines].reverse().map((text, index) => ({
      time,
      position: "aboveBar" as const,
      color,
      shape: "circle" as const,
      size: 0,
      id: `${ev.event_id}:exit-line-${index}`,
      text,
    })),
  ];
}

function timelineToMarkers(timeline: TimelineEvent[]): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];
  for (const ev of timeline) {
    markers.push(...fillToMarkers(ev));
  }
  markers.sort((a, b) => (a.time as number) - (b.time as number));
  return markers;
}

function computeTradeFocusedRanges(
  candles: Candle[],
): { defaultRange: VisibleRange; zoomedRange: VisibleRange; twoDayRange: VisibleRange } | null {
  if (candles.length === 0) return null;

  const ZOOMED_SPAN_SECONDS = 90 * 60;
  const DEFAULT_SPAN_SECONDS = 6 * 60 * 60;
  const TWO_DAY_SPAN_SECONDS = 48 * 60 * 60;
  const RIGHT_PAD_SECONDS = 2 * 60;

  const firstCandle = Math.floor(candles[0].t / 1000);
  const lastCandle = Math.floor(candles[candles.length - 1].t / 1000);
  const rightEdge = lastCandle + RIGHT_PAD_SECONDS;
  const zoomedStart = Math.max(lastCandle - ZOOMED_SPAN_SECONDS, firstCandle);
  const defaultStart = Math.max(lastCandle - DEFAULT_SPAN_SECONDS, firstCandle);
  const twoDayStart = Math.max(lastCandle - TWO_DAY_SPAN_SECONDS, firstCandle);

  return {
    defaultRange: { from: defaultStart as Time, to: rightEdge as Time },
    zoomedRange: { from: zoomedStart as Time, to: rightEdge as Time },
    twoDayRange: { from: twoDayStart as Time, to: rightEdge as Time },
  };
}

function computeUtcDailyChangePct(candles: Candle[], serverTimeOffsetMs: number): number | null {
  if (candles.length === 0) return null;

  const serverNow = new Date(Date.now() + serverTimeOffsetMs);
  const utcDayStart = Date.UTC(
    serverNow.getUTCFullYear(),
    serverNow.getUTCMonth(),
    serverNow.getUTCDate(),
  );
  const dayOpenCandle = candles.find(c => c.t >= utcDayStart);
  const latestCandle = candles[candles.length - 1];

  if (!dayOpenCandle || !latestCandle || dayOpenCandle.o <= 0 || latestCandle.c <= 0) {
    return null;
  }

  return ((latestCandle.c - dayOpenCandle.o) / dayOpenCandle.o) * 100;
}

export default function ChartPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const avgEntryLineRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]> | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("default");

  const candles = useDash(s => s.candles);
  const timeline = useDash(s => s.timeline);
  const position = useDash(s => s.position);
  const serverTimeOffsetMs = useDash(s => s.serverTimeOffsetMs);

  const positionRef = useRef(position);
  positionRef.current = position;

  const markers = useMemo<SeriesMarker<Time>[]>(() => timelineToMarkers(timeline), [timeline]);

  const ranges = useMemo(() => computeTradeFocusedRanges(candles), [candles]);
  const dailyChangePct = useMemo(
    () => computeUtcDailyChangePct(candles, serverTimeOffsetMs),
    [candles, serverTimeOffsetMs],
  );
  const dailyTone = polarity(dailyChangePct);
  const dailyChipClass = dailyTone === "pos" ? "chip-bull" : dailyTone === "neg" ? "chip-bear" : "chip-neutral";

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
      lastValueVisible: true,
      priceLineVisible: false,
    });
    series.applyOptions({
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number }; margins?: unknown } | null) => {
        const base = original();
        if (!base) return base;
        const pos = positionRef.current;
        const extras: number[] = [];
        if (pos.avg_entry > 0) extras.push(pos.avg_entry);
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
  }, [position.avg_entry, position.size]);

  return (
    <div className="pane relative overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/70 bg-panel/80 backdrop-blur flex-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/hype_icon.png"
              alt="HYPE"
              className="h-5 w-5 rounded-full select-none shadow-[0_0_12px_rgba(140,242,220,0.2)]"
              draggable={false}
            />
            <span className="pane-heading truncate">HYPE - 1m - auto zoom cycle</span>
            <span
              className={`${dailyChipClass} flex-none font-mono tabular-nums`}
              title="HYPE price change since the first 1m candle of the current UTC day"
            >
              <span className="text-[10px] uppercase tracking-wider opacity-80">UTC day</span>
              <span>{fmtPct(dailyChangePct)}</span>
            </span>
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
