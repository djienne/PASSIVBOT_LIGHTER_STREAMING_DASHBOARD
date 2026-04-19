import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useDash } from "../lib/store";
import { fmtDuration } from "../lib/format";
export default function HealthFooter() {
    const health = useDash(s => s.health);
    const wsStatus = useDash(s => s.wsStatus);
    const metrics = useDash(s => s.metrics);
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const vpsAge = health?.ts != null ? (now - health.ts) / 1000 : null;
    const stale = (vpsAge != null && vpsAge > 30 * 60) || wsStatus === "closed";
    return (_jsxs("div", { className: "pane px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono", children: [_jsx(Status, { label: "backend", ok: true }), _jsx(Status, { label: "browser \u2194 backend", ok: wsStatus === "open", detail: wsStatus }), _jsx(Status, { label: "lighter ws", ok: health?.ws_connected === true }), _jsx(Divider, {}), _jsx(Metric, { label: "bot uptime", value: fmtDuration(health?.bot_uptime_seconds) }), _jsx(Metric, { label: "vps sync", value: vpsAge != null ? `${vpsAge.toFixed(0)}s ago` : "—" }), _jsx(Metric, { label: "errors", value: String(health?.bot_errors ?? "—") }), _jsx(Metric, { label: "reconnects", value: String(health?.bot_ws_reconnects ?? "—") }), _jsx(Metric, { label: "rate limits", value: String(health?.bot_rate_limits ?? "—") }), _jsx("div", { className: "ml-auto text-subtle", children: metrics && `equity $${(metrics.baseline + metrics.total_pnl).toFixed(2)}` }), stale && (_jsxs(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, className: "fixed top-0 inset-x-0 z-50 bg-warn/90 text-black px-4 py-1.5 text-center font-semibold shadow-lg", children: ["\u26A0 data is stale \u2014 vps sync ", vpsAge != null ? `${vpsAge.toFixed(0)}s ago` : "unknown", " \u00B7 ws ", wsStatus] }))] }));
}
function Status({ label, ok, detail }) {
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `w-2 h-2 rounded-full ${ok ? "bg-bull" : "bg-bear"} shadow-[0_0_6px_currentColor]`, style: { color: ok ? "#10b981" : "#ef4444" } }), _jsx("span", { className: "text-subtle", children: label }), _jsx("span", { className: ok ? "text-bull" : "text-bear", children: detail ?? (ok ? "ok" : "down") })] }));
}
function Metric({ label, value }) {
    return (_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "text-subtle", children: label }), _jsx("span", { className: "text-text", children: value })] }));
}
function Divider() {
    return _jsx("span", { className: "text-border", children: "\u2502" });
}
