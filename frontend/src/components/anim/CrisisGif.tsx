import { motion } from "framer-motion";
import { fmtUSD } from "../../lib/format";

// The gif itself loops every 2.2 s (22 frames @ 10 fps, measured via ffprobe).
export const CRISIS_GIF_LOOP_MS = 2200;
export const CRISIS_EXIT_MS = 250;

export default function CrisisGif({ id, pnl }: { id: string; pnl: number }) {
  const gifSrc = `/this-is-fine-fine.gif?t=${encodeURIComponent(id)}`;
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, exit: { duration: CRISIS_EXIT_MS / 1000 } }}
    >
      <motion.div
        className="absolute"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 1.1, 2.0], opacity: [0.55, 0.3, 0] }}
        transition={{ duration: 2.0, ease: "easeOut" }}
        style={{
          width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(248,113,113,0.7) 0%, rgba(248,113,113,0.0) 70%)",
          filter: "blur(4px)",
        }}
      />
      <motion.img
        src={gifSrc}
        alt=""
        className="absolute rounded-lg shadow-[0_0_32px_rgba(248,113,113,0.35)]"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ width: 320, height: "auto", pointerEvents: "none" }}
        draggable={false}
      />
      <motion.div
        className="absolute text-bear font-display font-bold text-6xl tracking-tight drop-shadow-[0_0_16px_rgba(0,0,0,0.9)]"
        initial={{ y: 120, opacity: 0, scale: 0.9 }}
        animate={{ y: 160, opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {fmtUSD(pnl, 2)}
      </motion.div>
    </motion.div>
  );
}
