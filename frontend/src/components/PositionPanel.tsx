import { motion } from "framer-motion";
import { useDash } from "../lib/store";
import { fmtNumber, fmtPct, fmtUSD, polarity } from "../lib/format";

export default function PositionPanel() {
  const pos = useDash(s => s.position);
  const metrics = useDash(s => s.metrics);
  const symbol = useDash(s => s.symbol);

  const hasPos = pos.size > 0;
  const unrealized = hasPos ? (pos.mark - pos.avg_entry) * pos.size : 0;
  const unrealizedPct = hasPos && pos.avg_entry > 0
    ? ((pos.mark - pos.avg_entry) / pos.avg_entry) * 100
    : 0;
  const tone = polarity(unrealized);

  return (
    <div className="pane p-4 flex flex-col gap-3 min-h-[220px]">
      <div className="flex items-center justify-between">
        <span className="pane-heading">position</span>
        {hasPos ? (
          <span className="chip-bull">LONG · {symbol}</span>
        ) : (
          <span className="chip-neutral">FLAT</span>
        )}
      </div>

      {hasPos ? (
        <motion.div
          className="flex-1 flex flex-col gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Row label="size"        value={`${fmtNumber(pos.size, 4)} ${symbol}`} />
          <Row label="notional"    value={fmtUSD(pos.size * pos.mark, 2)} />
          <Row label="avg entry"   value={`$${pos.avg_entry.toFixed(4)}`} />
          <Row label="mark"        value={pos.mark > 0 ? `$${pos.mark.toFixed(4)}` : "—"} />
          <div className="mt-auto pt-3 border-t border-border">
            <div className="pane-heading mb-1">unrealized</div>
            <div className={`text-2xl metric-value ${tone === "pos" ? "text-bull" : tone === "neg" ? "text-bear" : "text-text"}`}>
              {fmtUSD(unrealized, 2)} <span className="text-sm text-subtle ml-1">{fmtPct(unrealizedPct)}</span>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="flex-1 grid place-items-center text-subtle text-sm">
          waiting for next entry
        </div>
      )}

      {metrics && (
        <div className="pt-2 border-t border-border flex items-center justify-between text-xs font-mono text-subtle">
          <span>exposure</span>
          <span className="text-text">{metrics.exposure_pct.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-subtle">{label}</span>
      <span className="font-mono text-text">{value}</span>
    </div>
  );
}
