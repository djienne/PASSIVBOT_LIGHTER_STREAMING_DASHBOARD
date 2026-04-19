import { useDash } from "../lib/store";
import { fmtDuration } from "../lib/format";

export default function OrdersPanel() {
  const agg = useDash(s => s.orderAggregate);
  const health = useDash(s => s.health);

  const openApprox = agg ? Math.max(0, agg.orders_placed - agg.orders_cancelled - agg.fills_count) : 0;

  return (
    <div className="pane p-4 min-h-[220px] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="pane-heading">orders (aggregate)</span>
        <span className="text-subtle text-[10px] uppercase tracking-wider">from bot [health]</span>
      </div>

      {agg ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="placed"    value={agg.orders_placed} />
            <Stat label="cancelled" value={agg.orders_cancelled} />
            <Stat label="open ~"    value={openApprox} highlight />
          </div>
          <div className="mt-1 text-xs font-mono text-subtle">fills since restart: {agg.fills_count}</div>
          <div className="mt-auto pt-3 border-t border-border text-xs font-mono text-subtle">
            last update {fmtAge(agg.snapshot_ts)} ago
          </div>
        </>
      ) : (
        <div className="flex-1 grid place-items-center text-subtle text-sm">
          waiting for first [health] heartbeat ({fmtDuration(health?.bot_uptime_seconds)} bot uptime)
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <div className="pane-heading">{label}</div>
      <div className={`metric-value text-xl ${highlight ? "text-accent" : "text-text"}`}>{value}</div>
    </div>
  );
}

function fmtAge(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}
