import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useDash } from "../lib/store";
import { fmtDuration } from "../lib/format";

export default function HealthFooter() {
  const health = useDash(s => s.health);
  const marketWsConnected = useDash(s => s.marketWsConnected);
  const wsStatus = useDash(s => s.wsStatus);
  const metrics = useDash(s => s.metrics);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const vpsAge = health?.ts != null ? (now - health.ts) / 1000 : null;
  const pollAge = health?.last_poll_ok != null ? (now - health.last_poll_ok) / 1000 : null;

  const isVpsDown = pollAge != null && pollAge > 3 * 60;
  const isBotDown = !isVpsDown && (vpsAge != null && vpsAge > 30 * 60);
  const stale = isVpsDown || isBotDown || wsStatus === "closed";

  return (
    <div className="pane px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono">
      <Status label="backend"   ok={true} />
      <Status label="browser ↔ backend" ok={wsStatus === "open"} detail={wsStatus} />
      <Status label="lighter ws" ok={marketWsConnected === true} detail={marketWsConnected == null ? "unknown" : undefined} />
      <Divider />
      <Metric label="bot uptime"  value={fmtDuration(health?.bot_uptime_seconds)} />
      <Metric label="vps sync"    value={vpsAge != null ? `${vpsAge.toFixed(0)}s ago` : "—"} />
      <Metric label="errors"      value={String(health?.bot_errors ?? "—")} />
      <Metric label="reconnects"  value={String(health?.bot_ws_reconnects ?? "—")} />
      <Metric label="rate limits" value={String(health?.bot_rate_limits ?? "—")} />
      <div className="ml-auto text-subtle">
        {metrics && `equity $${(metrics.baseline + metrics.total_pnl).toFixed(2)}`}
      </div>
      {stale && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed top-0 inset-x-0 z-50 bg-warn/90 text-black px-4 py-1.5 text-center font-semibold shadow-lg"
        >
          {wsStatus === "closed" ? (
             `⚠ data is stale — ws ${wsStatus}`
          ) : isVpsDown ? (
             `⚠ data is stale — VPS unreachable (last check ${pollAge?.toFixed(0) ?? "unknown"}s ago)`
          ) : isBotDown ? (
             `⚠ data is stale — Bot inactive (vps up, but last health log ${vpsAge != null ? `${vpsAge.toFixed(0)}s ago` : "unknown"})`
          ) : (
             `⚠ data is stale`
          )}
        </motion.div>
      )}
    </div>
  );
}

function Status({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-bull" : "bg-bear"} shadow-[0_0_6px_currentColor]`}
            style={{ color: ok ? "#10b981" : "#ef4444" }} />
      <span className="text-subtle">{label}</span>
      <span className={ok ? "text-bull" : "text-bear"}>{detail ?? (ok ? "ok" : "down")}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-subtle">{label}</span>
      <span className="text-text">{value}</span>
    </div>
  );
}

function Divider() {
  return <span className="text-border">│</span>;
}
