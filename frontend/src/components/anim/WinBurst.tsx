import { motion } from "framer-motion";
import type { TimelineEvent } from "../../lib/types";
import { formatTradePnl, tradeAction } from "../../lib/tradeLabels";

export const WIN_BURST_EXIT_MS = 250;
const MACMAHON_WIN_RATE = 0.5;
const FULL_WIN_LOOPS = 2;
const PARTIAL_WIN_LOOPS = 1;

type WinningGif = {
  src: "/macmahon.gif" | "/dicaprio.gif";
  loopMs: number;
};

const MACMAHON_GIF: WinningGif = { src: "/macmahon.gif", loopMs: 3560 };
const DICAPRIO_GIF: WinningGif = { src: "/dicaprio.gif", loopMs: 4200 };

function normalizedHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

function winningGifFor(eventId: string): WinningGif {
  return normalizedHash(eventId) < MACMAHON_WIN_RATE ? MACMAHON_GIF : DICAPRIO_GIF;
}

function loopsFor(ev: TimelineEvent): number {
  return tradeAction(ev) === "partial_exit" ? PARTIAL_WIN_LOOPS : FULL_WIN_LOOPS;
}

export function winBurstDurationFor(ev: TimelineEvent): number {
  const gif = winningGifFor(ev.event_id);
  return Math.max(gif.loopMs - WIN_BURST_EXIT_MS, loopsFor(ev) * gif.loopMs - WIN_BURST_EXIT_MS);
}

export default function WinBurst({ ev }: { ev: TimelineEvent }) {
  const gif = winningGifFor(ev.event_id);
  const isPartialExit = tradeAction(ev) === "partial_exit";
  const gifSrc = `${gif.src}?t=${encodeURIComponent(ev.event_id)}`;
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, exit: { duration: WIN_BURST_EXIT_MS / 1000 } }}
    >
      <motion.div
        className="absolute"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.6, 1.1, 2.2], opacity: [0.6, 0.35, 0] }}
        transition={{ duration: 2.2, ease: "easeOut" }}
        style={{
          width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(52,211,153,0.7) 0%, rgba(52,211,153,0.0) 70%)",
          filter: "blur(4px)",
        }}
      />
      <motion.img
        src={gifSrc}
        alt=""
        className="absolute rounded-lg shadow-[0_0_32px_rgba(52,211,153,0.35)]"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ width: isPartialExit ? 280 : 320, height: "auto", pointerEvents: "none" }}
        draggable={false}
      />
      <motion.div
        className={`absolute text-bull font-display font-bold tracking-tight drop-shadow-[0_0_16px_rgba(0,0,0,0.9)] ${isPartialExit ? "text-5xl" : "text-6xl"}`}
        initial={{ y: 120, opacity: 0, scale: 0.9 }}
        animate={{ y: isPartialExit ? 145 : 160, opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {formatTradePnl(ev)}
      </motion.div>
    </motion.div>
  );
}
