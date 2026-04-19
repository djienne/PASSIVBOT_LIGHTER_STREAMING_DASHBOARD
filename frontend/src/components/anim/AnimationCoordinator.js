import { jsx as _jsx } from "react/jsx-runtime";
import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useDash } from "../../lib/store";
import EntryPulse from "./EntryPulse";
import WinBurst from "./WinBurst";
import LossFade from "./LossFade";
import OrderFlash from "./OrderFlash";
const COOLDOWN_MS = 500;
function classify(ev) {
    if (ev.category === "order")
        return { kind: "order", id: ev.event_id, ev };
    if (ev.category !== "trade")
        return null;
    if (ev.side === "buy")
        return { kind: "entry", id: ev.event_id, ev };
    if (ev.win_loss === "win")
        return { kind: "win", id: ev.event_id, ev };
    if (ev.win_loss === "loss")
        return { kind: "loss", id: ev.event_id, ev };
    return null;
}
/** Drops replay-storm duplicates and caps each kind to one burst per COOLDOWN. */
export default function AnimationCoordinator() {
    const timeline = useDash(s => s.timeline);
    const [active, setActive] = useState([]);
    const seenRef = useRef(new Set());
    const lastFiredRef = useRef({});
    const bootstrappedRef = useRef(false);
    // On first render, pre-seed the seen set so we don't animate the bootstrap batch.
    useEffect(() => {
        if (bootstrappedRef.current)
            return;
        bootstrappedRef.current = true;
        for (const ev of timeline)
            seenRef.current.add(ev.event_id);
    }, [timeline]);
    useEffect(() => {
        if (!bootstrappedRef.current)
            return;
        const newOnes = [];
        for (const ev of timeline) {
            if (seenRef.current.has(ev.event_id))
                continue;
            seenRef.current.add(ev.event_id);
            const trig = classify(ev);
            if (!trig)
                continue;
            const now = Date.now();
            if ((lastFiredRef.current[trig.kind] ?? 0) + COOLDOWN_MS > now)
                continue;
            lastFiredRef.current[trig.kind] = now;
            newOnes.push(trig);
        }
        if (newOnes.length === 0)
            return;
        setActive(prev => [...prev, ...newOnes].slice(-8));
        const t = setTimeout(() => {
            setActive(prev => prev.filter(x => !newOnes.includes(x)));
        }, 2600);
        return () => clearTimeout(t);
    }, [timeline]);
    return (_jsx("div", { className: "pointer-events-none fixed inset-0 z-40", children: _jsx(AnimatePresence, { children: active.map(tr => {
                switch (tr.kind) {
                    case "entry": return _jsx(EntryPulse, {}, tr.id);
                    case "win": return _jsx(WinBurst, { ev: tr.ev }, tr.id);
                    case "loss": return _jsx(LossFade, { ev: tr.ev }, tr.id);
                    case "order": return _jsx(OrderFlash, {}, tr.id);
                }
            }) }) }));
}
