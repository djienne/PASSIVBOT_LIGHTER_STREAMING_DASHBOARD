import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef } from "react";
import { createChart, ColorType, CrosshairMode, LineStyle, } from "lightweight-charts";
import { useDash } from "../lib/store";
import { fmtPct, fmtUSD, polarity } from "../lib/format";
const BG = "#05070d";
const GRID = "#111827";
const DOLLAR_LINE = "#60a5fa";
const PCT_LINE = "#a78bfa";
const FILL_AREA = "rgba(96, 165, 250, 0.12)";
const ZERO_LINE = "#334155";
const BUY_DOT = "#34d399";
const SELL_DOT = "#f87171";
function buildCurves(timeline, baseline) {
    // Timeline is newest-first; PnL curve needs chronological order.
    // Lightweight-Charts uses second-granularity time keys; multiple fills in the
    // same second (e.g. sub-fills sharing a timestamp) must be merged to one
    // point or setData throws "data must be asc ordered". Markers have the same
    // constraint, so we aggregate per-second and label the bucket by the last
    // trade's side (which also drives the curve direction).
    const trades = timeline
        .filter(ev => ev.category === "trade" && ev.pnl != null)
        .slice()
        .sort((a, b) => a.ts - b.ts);
    const dollar = [];
    const percent = [];
    const markers = [];
    let cum = 0;
    let lastBucket = null;
    let buyCount = 0;
    let sellCount = 0;
    for (const ev of trades) {
        cum += ev.pnl ?? 0;
        const bucket = Math.floor(ev.ts / 1000);
        const time = bucket;
        const isBuy = ev.side === "buy";
        if (isBuy)
            buyCount += 1;
        else if (ev.side === "sell")
            sellCount += 1;
        if (bucket === lastBucket) {
            dollar[dollar.length - 1] = { time, value: cum };
            percent[percent.length - 1] = { time, value: baseline > 0 ? (cum / baseline) * 100 : 0 };
            // Replace the bucket's marker with the newer side / position preference.
            markers[markers.length - 1] = {
                time,
                position: isBuy ? "belowBar" : "aboveBar",
                color: isBuy ? BUY_DOT : SELL_DOT,
                shape: "circle",
            };
            continue;
        }
        dollar.push({ time, value: cum });
        percent.push({ time, value: baseline > 0 ? (cum / baseline) * 100 : 0 });
        markers.push({
            time,
            position: isBuy ? "belowBar" : "aboveBar",
            color: isBuy ? BUY_DOT : SELL_DOT,
            shape: "circle",
        });
        lastBucket = bucket;
    }
    return { dollar, percent, markers, buyCount, sellCount };
}
export default function PnlCurvePanel() {
    const timeline = useDash(s => s.timeline);
    const baseline = useDash(s => s.baseline);
    const metrics = useDash(s => s.metrics);
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const dollarSeriesRef = useRef(null);
    const percentSeriesRef = useRef(null);
    const zeroLineRef = useRef(null);
    const curves = useMemo(() => buildCurves(timeline, baseline), [timeline, baseline]);
    useEffect(() => {
        if (!containerRef.current)
            return;
        const chart = createChart(containerRef.current, {
            layout: { background: { type: ColorType.Solid, color: BG }, textColor: "#cbd5e1", fontFamily: "Inter, system-ui" },
            grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
            rightPriceScale: { borderColor: "#1e2638", visible: true, scaleMargins: { top: 0.1, bottom: 0.1 } },
            leftPriceScale: { borderColor: "#1e2638", visible: true, scaleMargins: { top: 0.1, bottom: 0.1 } },
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
            priceFormat: { type: "custom", formatter: (v) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toFixed(2)}` },
        });
        const percentSeries = chart.addLineSeries({
            color: PCT_LINE,
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            priceScaleId: "left",
            priceFormat: { type: "custom", formatter: (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%` },
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
        percentSeriesRef.current = percentSeries;
        return () => {
            chart.remove();
            chartRef.current = null;
            dollarSeriesRef.current = null;
            percentSeriesRef.current = null;
            zeroLineRef.current = null;
        };
    }, []);
    useEffect(() => {
        if (!dollarSeriesRef.current || !percentSeriesRef.current)
            return;
        dollarSeriesRef.current.setData(curves.dollar);
        percentSeriesRef.current.setData(curves.percent);
        dollarSeriesRef.current.setMarkers(curves.markers);
        chartRef.current?.timeScale().fitContent();
    }, [curves]);
    const totalDollar = curves.dollar.length ? curves.dollar[curves.dollar.length - 1].value : 0;
    const totalPct = baseline > 0 ? (totalDollar / baseline) * 100 : 0;
    const tone = polarity(totalDollar);
    const toneClass = tone === "pos" ? "text-bull" : tone === "neg" ? "text-bear" : "text-text";
    return (_jsxs("div", { className: "pane relative overflow-hidden h-full flex flex-col", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-2 border-b border-border/70 bg-panel/80 backdrop-blur flex-none", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "pane-heading", children: "cumulative PnL" }), _jsxs("span", { className: "text-subtle text-xs font-mono", children: [curves.buyCount + curves.sellCount, " fills \u00B7 ", curves.buyCount, " buys / ", curves.sellCount, " sells"] })] }), _jsxs("div", { className: "flex items-center gap-4 text-xs font-mono", children: [_jsxs("span", { className: "flex items-center gap-1.5 text-subtle", children: [_jsx("span", { className: "inline-block w-3 h-[2px]", style: { background: DOLLAR_LINE } }), "absolute $ (right)"] }), _jsxs("span", { className: "flex items-center gap-1.5 text-subtle", children: [_jsx("span", { className: "inline-block w-3", style: { borderTop: `2px dashed ${PCT_LINE}` } }), "% of $", baseline.toFixed(0), " (left)"] }), _jsxs("span", { className: "flex items-center gap-1.5 text-subtle", children: [_jsx("span", { className: "inline-block w-2 h-2 rounded-full", style: { background: BUY_DOT } }), "buy"] }), _jsxs("span", { className: "flex items-center gap-1.5 text-subtle", children: [_jsx("span", { className: "inline-block w-2 h-2 rounded-full", style: { background: SELL_DOT } }), "sell"] })] })] }), _jsxs("div", { className: "px-4 pt-2 flex items-baseline gap-3 flex-none", children: [_jsx("span", { className: `metric-value text-2xl ${toneClass}`, children: fmtUSD(totalDollar, 2) }), _jsx("span", { className: `text-sm font-mono ${toneClass}`, children: fmtPct(totalPct, 2) }), metrics && metrics.max_drawdown < 0 && (_jsxs("span", { className: "text-xs font-mono text-subtle ml-auto", children: ["peak dd ", fmtUSD(metrics.max_drawdown, 2), " (", fmtPct(metrics.max_drawdown_pct), ")"] }))] }), _jsx("div", { ref: containerRef, className: "flex-1 min-h-0" })] }));
}
