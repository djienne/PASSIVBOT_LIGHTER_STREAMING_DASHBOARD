import { motion } from "framer-motion";
import type { TimelineEvent } from "../../lib/types";
import { formatTradePnl } from "../../lib/tradeLabels";

export default function LossFade({ ev }: { ev: TimelineEvent }) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.4, 0] }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        style={{
          background:
            "linear-gradient(180deg, rgba(248,113,113,0.15) 0%, rgba(248,113,113,0.0) 30%, rgba(248,113,113,0.15) 100%)",
        }}
      />
      <motion.div
        className="text-bear font-display font-bold text-4xl tracking-tight"
        initial={{ y: -6, opacity: 0, scale: 0.95 }}
        animate={{ y: 30, opacity: [0, 1, 0], scale: [0.95, 1, 0.95] }}
        transition={{ duration: 2.0 }}
      >
        {formatTradePnl(ev)}
      </motion.div>
    </motion.div>
  );
}
