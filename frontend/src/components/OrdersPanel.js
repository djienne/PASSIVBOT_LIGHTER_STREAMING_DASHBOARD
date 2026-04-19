import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useDash } from "../lib/store";
import { fmtDuration } from "../lib/format";
export default function OrdersPanel() {
    const agg = useDash(s => s.orderAggregate);
    const health = useDash(s => s.health);
    const openApprox = agg ? Math.max(0, agg.orders_placed - agg.orders_cancelled - agg.fills_count) : 0;
    return (_jsxs("div", { className: "pane p-4 min-h-[220px] flex flex-col gap-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "pane-heading", children: "orders (aggregate)" }), _jsx("span", { className: "text-subtle text-[10px] uppercase tracking-wider", children: "from bot [health]" })] }), agg ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsx(Stat, { label: "placed", value: agg.orders_placed }), _jsx(Stat, { label: "cancelled", value: agg.orders_cancelled }), _jsx(Stat, { label: "open ~", value: openApprox, highlight: true })] }), _jsxs("div", { className: "mt-1 text-xs font-mono text-subtle", children: ["fills since restart: ", agg.fills_count] }), _jsxs("div", { className: "mt-auto pt-3 border-t border-border text-xs font-mono text-subtle", children: ["last update ", fmtAge(agg.snapshot_ts), " ago"] })] })) : (_jsxs("div", { className: "flex-1 grid place-items-center text-subtle text-sm", children: ["waiting for first [health] heartbeat (", fmtDuration(health?.bot_uptime_seconds), " bot uptime)"] }))] }));
}
function Stat({ label, value, highlight }) {
    return (_jsxs("div", { className: "flex flex-col", children: [_jsx("div", { className: "pane-heading", children: label }), _jsx("div", { className: `metric-value text-xl ${highlight ? "text-accent" : "text-text"}`, children: value })] }));
}
function fmtAge(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60)
        return `${Math.floor(s)}s`;
    if (s < 3600)
        return `${Math.floor(s / 60)}m`;
    return `${(s / 3600).toFixed(1)}h`;
}
