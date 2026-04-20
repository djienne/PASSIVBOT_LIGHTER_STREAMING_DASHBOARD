import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useDash } from "../../lib/store";
import type { TimelineEvent } from "../../lib/types";
import EntryPulse from "./EntryPulse";
import WinBurst, { WIN_BURST_MS } from "./WinBurst";
import LossFade from "./LossFade";
import OrderFlash from "./OrderFlash";

const COOLDOWN_MS = 500;
const DEFAULT_CLEANUP_MS = 2600;

type Trigger =
  | { kind: "entry"; id: string; ev: TimelineEvent }
  | { kind: "win"; id: string; ev: TimelineEvent }
  | { kind: "loss"; id: string; ev: TimelineEvent }
  | { kind: "order"; id: string; ev: TimelineEvent };

function classify(ev: TimelineEvent): Trigger | null {
  if (ev.category === "order") return { kind: "order", id: ev.event_id, ev };
  if (ev.category !== "trade") return null;
  if (ev.side === "buy") return { kind: "entry", id: ev.event_id, ev };
  if (ev.win_loss === "win") return { kind: "win", id: ev.event_id, ev };
  if (ev.win_loss === "loss") return { kind: "loss", id: ev.event_id, ev };
  return null;
}

function cooldownFor(kind: Trigger["kind"]): number {
  return kind === "win" ? WIN_BURST_MS : COOLDOWN_MS;
}

function cleanupFor(kind: Trigger["kind"]): number {
  return kind === "win" ? WIN_BURST_MS : DEFAULT_CLEANUP_MS;
}

/** Drops replay-storm duplicates and caps each kind to one burst per cooldown. */
export default function AnimationCoordinator() {
  const timeline = useDash(s => s.timeline);
  const debugTrigger = useDash(s => s.debugTrigger);
  const [active, setActive] = useState<Trigger[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const lastFiredRef = useRef<Record<string, number>>({});
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    for (const ev of timeline) seenRef.current.add(ev.event_id);
  }, [timeline]);

  const fireTrigger = (trig: Trigger) => {
    const now = Date.now();
    if ((lastFiredRef.current[trig.kind] ?? 0) + cooldownFor(trig.kind) > now) return;
    lastFiredRef.current[trig.kind] = now;
    setActive(prev => [...prev, trig].slice(-8));
    setTimeout(() => {
      setActive(prev => prev.filter(x => x !== trig));
    }, cleanupFor(trig.kind));
  };

  useEffect(() => {
    if (!bootstrappedRef.current) return;
    for (const ev of timeline) {
      if (seenRef.current.has(ev.event_id)) continue;
      seenRef.current.add(ev.event_id);
      const trig = classify(ev);
      if (!trig) continue;
      fireTrigger(trig);
    }
  }, [timeline]);

  useEffect(() => {
    if (!debugTrigger) return;
    if (seenRef.current.has(debugTrigger.event_id)) return;
    seenRef.current.add(debugTrigger.event_id);
    const trig = classify(debugTrigger);
    if (trig) fireTrigger(trig);
  }, [debugTrigger]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <AnimatePresence>
        {active.map(tr => {
          switch (tr.kind) {
            case "entry": return <EntryPulse key={tr.id} />;
            case "win":   return <WinBurst  key={tr.id} ev={tr.ev} />;
            case "loss":  return <LossFade  key={tr.id} ev={tr.ev} />;
            case "order": return <OrderFlash key={tr.id} />;
          }
        })}
      </AnimatePresence>
    </div>
  );
}
