import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useDash } from "../../lib/store";
import type { TimelineEvent } from "../../lib/types";
import EntryPulse from "./EntryPulse";
import WinBurst from "./WinBurst";
import LossFade from "./LossFade";
import OrderFlash from "./OrderFlash";

const COOLDOWN_MS = 500;

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

/** Drops replay-storm duplicates and caps each kind to one burst per COOLDOWN. */
export default function AnimationCoordinator() {
  const timeline = useDash(s => s.timeline);
  const [active, setActive] = useState<Trigger[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const lastFiredRef = useRef<Record<string, number>>({});
  const bootstrappedRef = useRef(false);

  // On first render, pre-seed the seen set so we don't animate the bootstrap batch.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    for (const ev of timeline) seenRef.current.add(ev.event_id);
  }, [timeline]);

  useEffect(() => {
    if (!bootstrappedRef.current) return;
    const newOnes: Trigger[] = [];
    for (const ev of timeline) {
      if (seenRef.current.has(ev.event_id)) continue;
      seenRef.current.add(ev.event_id);
      const trig = classify(ev);
      if (!trig) continue;
      const now = Date.now();
      if ((lastFiredRef.current[trig.kind] ?? 0) + COOLDOWN_MS > now) continue;
      lastFiredRef.current[trig.kind] = now;
      newOnes.push(trig);
    }
    if (newOnes.length === 0) return;
    setActive(prev => [...prev, ...newOnes].slice(-8));
    const t = setTimeout(() => {
      setActive(prev => prev.filter(x => !newOnes.includes(x)));
    }, 2600);
    return () => clearTimeout(t);
  }, [timeline]);

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
