import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from "framer-motion";
import { useDash } from "../lib/store";
import { fmtNumber, fmtPct, fmtUSD, polarity } from "../lib/format";
export default function PositionPanel() {
    const pos = useDash(s => s.position);
    const metrics = useDash(s => s.metrics);
    const symbol = useDash(s => s.symbol);
    const hasPos = pos.size > 0;
    const unrealized = hasPos ? (pos.mark - pos.avg_entry) * pos.size : 0;
    const unrealizedPct = hasPos && pos.avg_entry > 0
        ? ((pos.mark - pos.avg_entry) / pos.avg_entry) * 100
        : 0;
    const tone = polarity(unrealized);
    return (_jsxs("div", { className: "pane p-4 flex flex-col gap-3 min-h-[220px]", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "pane-heading", children: "position" }), hasPos ? (_jsxs("span", { className: "chip-bull", children: ["LONG \u00B7 ", symbol] })) : (_jsx("span", { className: "chip-neutral", children: "FLAT" }))] }), hasPos ? (_jsxs(motion.div, { className: "flex-1 flex flex-col gap-2", initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 }, children: [_jsx(Row, { label: "size", value: `${fmtNumber(pos.size, 4)} ${symbol}` }), _jsx(Row, { label: "notional", value: fmtUSD(pos.size * pos.mark, 2) }), _jsx(Row, { label: "avg entry", value: `$${pos.avg_entry.toFixed(4)}` }), _jsx(Row, { label: "mark", value: pos.mark > 0 ? `$${pos.mark.toFixed(4)}` : "—" }), _jsxs("div", { className: "mt-auto pt-3 border-t border-border", children: [_jsx("div", { className: "pane-heading mb-1", children: "unrealized" }), _jsxs("div", { className: `text-2xl metric-value ${tone === "pos" ? "text-bull" : tone === "neg" ? "text-bear" : "text-text"}`, children: [fmtUSD(unrealized, 2), " ", _jsx("span", { className: "text-sm text-subtle ml-1", children: fmtPct(unrealizedPct) })] })] })] })) : (_jsx("div", { className: "flex-1 grid place-items-center text-subtle text-sm", children: "waiting for next entry" })), metrics && (_jsxs("div", { className: "pt-2 border-t border-border flex items-center justify-between text-xs font-mono text-subtle", children: [_jsx("span", { children: "exposure" }), _jsxs("span", { className: "text-text", children: [metrics.exposure_pct.toFixed(1), "%"] })] }))] }));
}
function Row({ label, value }) {
    return (_jsxs("div", { className: "flex items-center justify-between text-sm", children: [_jsx("span", { className: "text-subtle", children: label }), _jsx("span", { className: "font-mono text-text", children: value })] }));
}
