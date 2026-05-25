import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useDash } from "../../lib/store";
import type { TimelineEvent } from "../../lib/types";
import EntryPulse from "./EntryPulse";
import WinBurst, { winBurstDurationFor } from "./WinBurst";
import LossFade from "./LossFade";
import OrderFlash from "./OrderFlash";
import CrisisGif, { CRISIS_GIF_LOOP_MS, CRISIS_EXIT_MS } from "./CrisisGif";

const COOLDOWN_MS = 500;
const DEFAULT_CLEANUP_MS = 2600;
const CRISIS_THRESHOLD_USD = -10;
const CRISIS_MIN_GAP_MS = 30_000;
const CRISIS_MAX_GAP_MS = 60_000;
// Show the "this is fine" gif for five full loops (~11 s) before fading.
const CRISIS_GIF_MS = 5 * CRISIS_GIF_LOOP_MS - CRISIS_EXIT_MS;

type Trigger =
  | { kind: "entry"; id: string; ev: TimelineEvent }
  | { kind: "win"; id: string; ev: TimelineEvent }
  | { kind: "loss"; id: string; ev: TimelineEvent }
  | { kind: "order"; id: string; ev: TimelineEvent }
  | { kind: "crisis"; id: string; pnl: number };

function classify(ev: TimelineEvent): Trigger | null {
  if (ev.category === "order") return { kind: "order", id: ev.event_id, ev };
  if (ev.category !== "trade") return null;
  if (ev.side === "buy") return { kind: "entry", id: ev.event_id, ev };
  if (ev.win_loss === "win") return { kind: "win", id: ev.event_id, ev };
  if (ev.win_loss === "loss") return { kind: "loss", id: ev.event_id, ev };
  return null;
}

function cooldownFor(trig: Trigger): number {
  if (trig.kind === "win") return winBurstDurationFor(trig.ev);
  if (trig.kind === "crisis") return CRISIS_GIF_MS;
  return COOLDOWN_MS;
}

function cleanupFor(trig: Trigger): number {
  if (trig.kind === "win") return winBurstDurationFor(trig.ev);
  if (trig.kind === "crisis") return CRISIS_GIF_MS;
  return DEFAULT_CLEANUP_MS;
}

/** Drops replay-storm duplicates and caps each kind to one burst per cooldown. */
export default function AnimationCoordinator() {
  const timeline = useDash(s => s.timeline);
  const debugTrigger = useDash(s => s.debugTrigger);
  const position = useDash(s => s.position);
  const [active, setActive] = useState<Trigger[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const lastFiredRef = useRef<Record<string, number>>({});
  const bootstrappedRef = useRef(false);
  const crisisNextAtRef = useRef<number>(0);
  const crisisLatchedRef = useRef<boolean>(false);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    for (const ev of timeline) seenRef.current.add(ev.event_id);
  }, [timeline]);

  const fireTrigger = (trig: Trigger) => {
    const now = Date.now();
    if ((lastFiredRef.current[trig.kind] ?? 0) + cooldownFor(trig) > now) return;
    lastFiredRef.current[trig.kind] = now;
    setActive(prev => [...prev, trig].slice(-8));
    setTimeout(() => {
      setActive(prev => prev.filter(x => x !== trig));
    }, cleanupFor(trig));
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

  useEffect(() => {
    const unrealized = position.size > 0
      ? (position.mark - position.avg_entry) * position.size
      : 0;
    const belowThreshold = position.size > 0 && unrealized < CRISIS_THRESHOLD_USD;

    if (!belowThreshold) {
      crisisLatchedRef.current = false;
      crisisNextAtRef.current = 0;
      return;
    }
    const now = Date.now();
    const justCrossed = !crisisLatchedRef.current;
    const dueForRepeat = crisisNextAtRef.current > 0 && now >= crisisNextAtRef.current;
    if (justCrossed || dueForRepeat) {
      crisisLatchedRef.current = true;
      const gap = CRISIS_MIN_GAP_MS + Math.floor(Math.random() * (CRISIS_MAX_GAP_MS - CRISIS_MIN_GAP_MS));
      crisisNextAtRef.current = now + gap;
      fireTrigger({ kind: "crisis", id: `crisis-${now}`, pnl: unrealized });
    }
  }, [position.size, position.mark, position.avg_entry]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <AnimatePresence>
        {active.map(tr => {
          switch (tr.kind) {
            case "entry":  return <EntryPulse key={tr.id} />;
            case "win":    return <WinBurst  key={tr.id} ev={tr.ev} />;
            case "loss":   return <LossFade  key={tr.id} ev={tr.ev} />;
            case "order":  return <OrderFlash key={tr.id} />;
            case "crisis": return <CrisisGif key={tr.id} id={tr.id} pnl={tr.pnl} />;
          }
        })}
      </AnimatePresence>
    </div>
  );
}
