import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useDash } from "../lib/store";

/** Small latency evaluation badge for the VPS-to-Lighter path. */
export default function VpsLatencyChip() {
  const latency = useDash(s => s.vpsLatency);
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!latency) {
    const elapsedS = Math.max(0, Math.floor((now - mountedAt) / 1000));
    const waiting = elapsedS >= 45;
    return (
      <div
        className="pane px-3 py-2 flex items-center gap-2 text-xs"
        title={
          waiting
            ? "No VPS-to-Lighter latency sample yet. Check VPS_HOST, VPS_USER, SSH key, and VPS reachability."
            : "Waiting for the first VPS-to-Lighter latency sample."
        }
      >
        <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${waiting ? "bg-warn" : "bg-neutral"}`} />
        <span className={waiting ? "text-warn" : "text-subtle"}>
          {waiting ? "VPS latency waiting for SSH: AWS Tokyo - Lighter" : "running latency evaluation: AWS Tokyo - Lighter..."}
        </span>
      </div>
    );
  }

  const ageS = Math.max(0, Math.floor((now - latency.ts) / 1000));
  const ms = latency.avg_ms;
  const tone =
    ms < 5 ? "text-bull" :
    ms < 20 ? "text-accent" :
    ms < 80 ? "text-warn" :
    "text-bear";

  const dotColor =
    ms < 5 ? "#10b981" :
    ms < 20 ? "#60a5fa" :
    ms < 80 ? "#fbbf24" :
    "#ef4444";

  return (
    <motion.div
      key={latency.ts}
      initial={{ opacity: 0.4, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="pane px-4 py-2 flex items-center gap-3"
      title={[
        "Latency evaluation",
        `path: AWS Tokyo -> ${latency.target}`,
        `method: ${latency.method.toUpperCase()} - ${latency.samples} samples`,
        latency.min_ms != null ? `min ${latency.min_ms.toFixed(2)} ms` : null,
        latency.max_ms != null ? `max ${latency.max_ms.toFixed(2)} ms` : null,
        latency.jitter_ms != null ? `jitter ${latency.jitter_ms.toFixed(2)} ms` : null,
        `region: ${latency.region}`,
        `updated ${ageS}s ago - refresh ~5 min`,
      ].filter(Boolean).join("\n")}
    >
      <span
        className="w-2 h-2 rounded-full flex-none"
        style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}` }}
      />
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-widest text-subtle">
          latency evaluation
        </span>
        <span className="text-[10px] uppercase tracking-[0.16em] text-dim">
          AWS Tokyo - Lighter RTT
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className={`metric-value font-mono text-xl ${tone}`}>
            {ms < 10 ? ms.toFixed(2) : ms.toFixed(1)}
          </span>
          <span className="text-subtle text-xs font-mono">ms</span>
          <span className="text-dim text-[10px] font-mono ml-1">
            - {latency.method} - {ageS < 60 ? `${ageS}s ago` : `${Math.floor(ageS / 60)}m ago`}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
