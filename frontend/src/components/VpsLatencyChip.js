import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useDash } from "../lib/store";
/** "Tokyo ↔ Lighter" RTT pill — a little show-off card. */
export default function VpsLatencyChip() {
    const latency = useDash(s => s.vpsLatency);
    const [ageS, setAgeS] = useState(0);
    useEffect(() => {
        const id = setInterval(() => {
            if (latency)
                setAgeS(Math.max(0, Math.floor((Date.now() - latency.ts) / 1000)));
        }, 1000);
        return () => clearInterval(id);
    }, [latency]);
    if (!latency) {
        return (_jsxs("div", { className: "pane px-3 py-2 flex items-center gap-2 text-xs", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-neutral animate-pulse" }), _jsx("span", { className: "text-subtle", children: "measuring Tokyo \u2192 Lighter\u2026" })] }));
    }
    const ms = latency.avg_ms;
    const tone = ms < 5 ? "text-bull" :
        ms < 20 ? "text-accent" :
            ms < 80 ? "text-warn" :
                "text-bear";
    const dotColor = ms < 5 ? "#10b981" :
        ms < 20 ? "#60a5fa" :
            ms < 80 ? "#fbbf24" :
                "#ef4444";
    return (_jsxs(motion.div, { initial: { opacity: 0.4, scale: 0.98 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.4 }, className: "pane px-4 py-2 flex items-center gap-3", title: [
            `method: ${latency.method.toUpperCase()} · ${latency.samples} samples`,
            latency.min_ms != null ? `min ${latency.min_ms.toFixed(2)} ms` : null,
            latency.max_ms != null ? `max ${latency.max_ms.toFixed(2)} ms` : null,
            latency.jitter_ms != null ? `jitter ${latency.jitter_ms.toFixed(2)} ms` : null,
            `target: ${latency.target}`,
            `region: ${latency.region}`,
            `updated ${ageS}s ago · refresh ~5 min`,
        ].filter(Boolean).join("\n"), children: [_jsx("span", { className: "w-2 h-2 rounded-full flex-none", style: { background: dotColor, boxShadow: `0 0 8px ${dotColor}` } }), _jsxs("div", { className: "flex flex-col leading-tight", children: [_jsx("span", { className: "text-[10px] uppercase tracking-widest text-subtle", children: "AWS Tokyo \u2194 Lighter RTT" }), _jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: `metric-value font-mono text-xl ${tone}`, children: ms < 10 ? ms.toFixed(2) : ms.toFixed(1) }), _jsx("span", { className: "text-subtle text-xs font-mono", children: "ms" }), _jsxs("span", { className: "text-dim text-[10px] font-mono ml-1", children: ["\u00B7 ", latency.method, " \u00B7 ", ageS < 60 ? `${ageS}s ago` : `${Math.floor(ageS / 60)}m ago`] })] })] })] }, latency.ts));
}
