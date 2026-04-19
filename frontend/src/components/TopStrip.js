import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useDash } from "../lib/store";
import { fmtDays, fmtElapsed, fmtNumber, fmtPct, fmtUSD, polarity } from "../lib/format";
function MetricCard(props) {
    const toneClass = props.tone === "pos" ? "text-bull" :
        props.tone === "neg" ? "text-bear" :
            "text-text";
    return (_jsxs("div", { className: "pane px-4 py-3 min-w-[160px] flex-1 flex flex-col justify-between gap-1", children: [_jsx("div", { className: "pane-heading", children: props.label }), _jsx("div", { className: `metric-value text-2xl ${toneClass}`, children: props.value }), props.sub && _jsx("div", { className: "text-subtle text-xs font-mono", children: props.sub }), props.accent && (_jsx("div", { className: "absolute inset-x-4 top-0 h-0.5 rounded-b-full", style: { background: props.accent } }))] }));
}
export default function TopStrip() {
    const m = useDash(s => s.metrics);
    const sym = useDash(s => s.symbol);
    const baseline = useDash(s => s.baseline);
    const balance = useDash(s => s.balance);
    const position = useDash(s => s.position);
    const timeline = useDash(s => s.timeline);
    // Most recent fill timestamp — timeline is stored newest-first, so the
    // first `trade` entry is the latest. Fall back to the server's
    // `days_since_last_trade` if we don't have a timeline entry yet (fresh
    // cold start before any WS events).
    const lastTradeTs = useMemo(() => {
        for (const ev of timeline) {
            if (ev.category === "trade")
                return ev.ts;
        }
        return null;
    }, [timeline]);
    // Tick once per second so the "time since last trade" card has live
    // second-precision when the gap is small. At ~1 render/s for ~80 B of
    // text this is free.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);
    const lastTradeMs = lastTradeTs != null
        ? now - lastTradeTs
        : m
            ? m.days_since_last_trade * 86_400_000
            : null;
    if (!m) {
        return (_jsx("div", { className: "flex gap-3", children: Array.from({ length: 7 }).map((_, i) => (_jsx("div", { className: "pane px-4 py-3 min-w-[160px] flex-1 h-[84px] animate-pulse" }, i))) }));
    }
    // Derive unrealized + totals from the live mark (updated on every ticker
    // frame) rather than the 5-min-old server metrics snapshot. Keeps the
    // PnL card perfectly in sync with PositionPanel and the mark-price line
    // on the chart.
    const unrealizedLive = position.size > 0
        ? (position.mark - position.avg_entry) * position.size
        : 0;
    const totalPnlLive = m.realized_pnl + unrealizedLive;
    const returnPctLive = baseline > 0 ? (totalPnlLive / baseline) * 100 : 0;
    const totalTone = polarity(totalPnlLive) === "pos" ? "pos" : polarity(totalPnlLive) === "neg" ? "neg" : "neutral";
    const returnTone = polarity(returnPctLive) === "pos" ? "pos" : polarity(returnPctLive) === "neg" ? "neg" : "neutral";
    return (_jsxs(motion.div, { className: "grid grid-cols-4 xl:grid-cols-7 gap-3", initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 }, children: [_jsx(MetricCard, { label: `${sym} — total PnL`, value: fmtUSD(totalPnlLive), sub: `realized ${fmtUSD(m.realized_pnl)} · unrealized ${fmtUSD(unrealizedLive)}`, tone: totalTone }), _jsx(MetricCard, { label: `return vs $${baseline.toFixed(0)}`, value: fmtPct(returnPctLive), sub: balance ? `balance ${fmtUSD(balance.balance)}` : "balance —", tone: returnTone }), _jsx(MetricCard, { label: "sharpe", value: fmtNumber(m.sharpe, 2), sub: "0% rf \u00B7 5m samples" }), _jsx(MetricCard, { label: "max drawdown", value: fmtPct(m.max_drawdown_pct), sub: fmtUSD(m.max_drawdown), tone: m.max_drawdown < 0 ? "neg" : "neutral" }), _jsx(MetricCard, { label: "time since last trade", value: fmtElapsed(lastTradeMs), sub: `trading for ${fmtDays(m.days_since_first_trade)}` }), _jsx(MetricCard, { label: "win rate", value: `${m.win_rate.toFixed(1)}%`, sub: `avg win ${fmtUSD(m.avg_win)} · loss ${fmtUSD(m.avg_loss)}`, tone: m.win_rate > 50 ? "pos" : m.win_rate > 0 ? "neutral" : "neg" }), _jsx(MetricCard, { label: `cagr (${m.cagr_label})`, value: fmtPct(m.cagr), sub: `exposure ${m.exposure_pct.toFixed(1)}%`, tone: polarity(m.cagr) === "pos" ? "pos" : polarity(m.cagr) === "neg" ? "neg" : "neutral" })] }));
}
