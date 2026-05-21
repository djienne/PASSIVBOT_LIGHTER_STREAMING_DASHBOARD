import { motion } from "framer-motion";
import type { TimelineEvent } from "../../lib/types";
import { formatTradePnl } from "../../lib/tradeLabels";

export const GIF_LOOP_MS = 4200;
export const WIN_BURST_EXIT_MS = 250;
// Cleanup fires so the exit fade completes exactly at the end of loop 2 — no
// visible third loop.
export const WIN_BURST_MS = 2 * GIF_LOOP_MS - WIN_BURST_EXIT_MS;

export default function WinBurst({ ev }: { ev: TimelineEvent }) {
  const gifSrc = `/dicaprio.gif?t=${encodeURIComponent(ev.event_id)}`;
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
        style={{ width: 320, height: "auto", pointerEvents: "none" }}
        draggable={false}
      />
      <motion.div
        className="absolute text-bull font-display font-bold text-6xl tracking-tight drop-shadow-[0_0_16px_rgba(0,0,0,0.9)]"
        initial={{ y: 120, opacity: 0, scale: 0.9 }}
        animate={{ y: 160, opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {formatTradePnl(ev)}
      </motion.div>
    </motion.div>
  );
}
