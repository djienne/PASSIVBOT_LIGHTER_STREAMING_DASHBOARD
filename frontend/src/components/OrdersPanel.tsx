import { useDash } from "../lib/store";
import { fmtDuration, fmtPct } from "../lib/format";

export default function OrdersPanel() {
  const agg = useDash(s => s.orderAggregate);
  const funding = useDash(s => s.funding);
  const health = useDash(s => s.health);

  const openApprox = agg ? Math.max(0, agg.orders_placed - agg.orders_cancelled - agg.fills_count) : 0;

  return (
    <div className="pane p-4 min-h-[236px] flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="pane-heading">orders (aggregate)</span>
        <span className="text-subtle text-[10px] uppercase tracking-wider">from bot [health]</span>
      </div>

      {agg ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="placed"    value={agg.orders_placed} />
            <Stat label="cancelled" value={agg.orders_cancelled} />
            <Stat label="open ~"    value={openApprox} highlight />
          </div>
          <div className="text-sm font-mono text-subtle">fills since restart: {agg.fills_count}</div>
          <div className="text-xs uppercase tracking-[0.18em] text-bull font-semibold">
            Total trading fees paid: ZERO
          </div>
          <div className="text-sm font-mono text-subtle">
            Current funding fees (APR): <span className={fundingToneClass(funding?.annualized_apr_pct)}>{fmtPct(funding?.annualized_apr_pct)}</span>
          </div>
        </>
      ) : (
        <div className="flex-1 grid place-items-center text-subtle text-sm">
          <div className="flex flex-col items-center gap-2">
            <span>waiting for first [health] heartbeat ({fmtDuration(health?.bot_uptime_seconds)} bot uptime)</span>
            <span className="text-xs uppercase tracking-[0.18em] text-bull font-semibold">
              Total trading fees paid: ZERO
            </span>
            <span className="text-sm font-mono text-subtle">
              Current funding fees (APR): <span className={fundingToneClass(funding?.annualized_apr_pct)}>{fmtPct(funding?.annualized_apr_pct)}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function fundingToneClass(apr: number | null | undefined): string {
  if (apr == null) return "text-text";
  if (apr > 0) return "text-bear";
  if (apr < 0) return "text-bull";
  return "text-text";
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <div className="text-[11px] uppercase tracking-widest text-subtle font-medium">{label}</div>
      <div className={`metric-value text-2xl ${highlight ? "text-accent" : "text-text"}`}>{value}</div>
    </div>
  );
}
