import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import TopStrip from "../components/TopStrip";
import ChartPanel from "../components/ChartPanel";
import PnlCurvePanel from "../components/PnlCurvePanel";
import PositionPanel from "../components/PositionPanel";
import OrdersPanel from "../components/OrdersPanel";
import ActionFeed from "../components/ActionFeed";
import HealthFooter from "../components/HealthFooter";
import VpsLatencyChip from "../components/VpsLatencyChip";
import AnimationCoordinator from "../components/anim/AnimationCoordinator";
import { fetchBootstrap } from "../lib/api";
import { makeWS } from "../lib/ws";
import { useDash } from "../lib/store";
export default function Dashboard() {
    const applyBootstrap = useDash(s => s.applyBootstrap);
    const applyEnvelope = useDash(s => s.applyEnvelope);
    const setWSStatus = useDash(s => s.setWSStatus);
    useEffect(() => {
        let cancelled = false;
        let reboot = null;
        const boot = async () => {
            try {
                const b = await fetchBootstrap();
                if (!cancelled)
                    applyBootstrap(b);
            }
            catch {
                if (!cancelled)
                    reboot = window.setTimeout(boot, 2000);
            }
        };
        boot();
        const ws = makeWS();
        const offMsg = ws.onMessage(env => applyEnvelope(env));
        const offStatus = ws.onStatus(setWSStatus);
        ws.connect();
        return () => {
            cancelled = true;
            if (reboot)
                window.clearTimeout(reboot);
            offMsg();
            offStatus();
            ws.close();
        };
    }, [applyBootstrap, applyEnvelope, setWSStatus]);
    return (_jsxs("div", { className: "min-h-full p-4 md:p-6 flex flex-col gap-4", children: [_jsxs("header", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("img", { src: "/pbot_logo_full.svg", alt: "Passivbot", className: "h-9 w-auto select-none", draggable: false }), _jsx("div", { className: "w-px h-8 bg-border" }), _jsxs("div", { className: "flex flex-col leading-tight", children: [_jsx("span", { className: "text-xs uppercase tracking-[0.2em] text-subtle", children: "on Lighter \u00B7 HYPE" }), _jsx("span", { className: "text-xl font-display font-semibold", children: "live dashboard" })] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(VpsLatencyChip, {}), _jsx(Link, { to: "/stream", className: "chip-neutral hover:border-accent hover:text-accent transition", children: "stream mode \u27F6" })] })] }), _jsx(TopStrip, {}), _jsxs("div", { className: "grid gap-4", style: { gridTemplateColumns: "minmax(0,1fr) 360px" }, children: [_jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("div", { className: "h-[560px] min-h-[560px] grid gap-4", style: { gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }, children: [_jsx(PnlCurvePanel, {}), _jsx(ChartPanel, {})] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsx(PositionPanel, {}), _jsx(OrdersPanel, {})] })] }), _jsx("div", { className: "h-[820px] min-h-[820px]", children: _jsx(ActionFeed, {}) })] }), _jsx(HealthFooter, {}), _jsx(AnimationCoordinator, {})] }));
}
