import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useDash } from "../lib/store";
import { fmtNumber, fmtTimeShort, fmtUSD } from "../lib/format";
const VISIBLE = 10;
export default function ActionFeed() {
    const timeline = useDash(s => s.timeline);
    const rows = useMemo(() => timeline.slice(0, VISIBLE * 6), [timeline]);
    return (_jsxs("div", { className: "pane p-0 flex flex-col min-h-0 h-full", children: [_jsxs("div", { className: "px-4 py-3 flex items-center justify-between border-b border-border", children: [_jsx("span", { className: "pane-heading", children: "action feed" }), _jsxs("span", { className: "text-subtle text-xs font-mono", children: ["newest first \u00B7 ", VISIBLE, " visible"] })] }), _jsxs("div", { className: "relative flex-1 overflow-y-auto", children: [_jsx(AnimatePresence, { initial: false, children: rows.map((ev, i) => (_jsxs(motion.div, { initial: i === 0 ? { opacity: 0, y: -6, backgroundColor: tintFor(ev) } : false, animate: { opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }, exit: { opacity: 0 }, transition: { duration: 0.35 }, className: "px-4 py-2.5 border-b border-border/60 flex items-start gap-3", children: [_jsx(TimeCell, { ts: ev.ts }), _jsx(Dot, { ev: ev }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "font-medium text-text truncate", children: ev.label }), ev.pnl != null && ev.pnl !== 0 && (_jsx("span", { className: ev.pnl > 0 ? "text-bull font-mono" : "text-bear font-mono", children: fmtUSD(ev.pnl, 2) }))] }), _jsxs("div", { className: "text-xs font-mono text-subtle mt-0.5 flex items-center gap-3", children: [ev.side && _jsx("span", { className: ev.side === "buy" ? "text-bull" : "text-bear", children: ev.side.toUpperCase() }), ev.qty != null && _jsxs("span", { children: ["qty ", fmtNumber(ev.qty, 4)] }), ev.price != null && _jsxs("span", { children: ["@ $", ev.price.toFixed(4)] })] })] })] }, ev.event_id))) }), rows.length === 0 && (_jsx("div", { className: "p-8 text-subtle text-sm text-center", children: "no events yet" }))] })] }));
}
function tintFor(ev) {
    if (ev.win_loss === "win")
        return "rgba(52, 211, 153, 0.12)";
    if (ev.win_loss === "loss")
        return "rgba(248, 113, 113, 0.12)";
    if (ev.category === "order")
        return "rgba(96, 165, 250, 0.08)";
    return "rgba(148, 163, 184, 0.06)";
}
function Dot({ ev }) {
    let color = "#64748b";
    if (ev.win_loss === "win")
        color = "#10b981";
    else if (ev.win_loss === "loss")
        color = "#ef4444";
    else if (ev.side === "buy")
        color = "#34d399";
    else if (ev.side === "sell")
        color = "#f87171";
    return _jsx("span", { className: "mt-1.5 w-2 h-2 rounded-full flex-none", style: { background: color, boxShadow: `0 0 6px ${color}` } });
}
function TimeCell({ ts }) {
    return _jsx("span", { className: "text-[11px] font-mono text-dim w-16 tabular-nums select-none", children: fmtTimeShort(ts) });
}
