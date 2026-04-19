import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useDash } from "../lib/store";
import { fmtDuration, fmtElapsed, fmtNumber, fmtPct, fmtUSD, polarity } from "../lib/format";

function MetricCard(props: {
  label: string;
  value: string;
  sub?: string;
  note?: string;
  tone?: "pos" | "neg" | "neutral";
  accent?: string;
}) {
  const toneClass =
    props.tone === "pos" ? "text-bull" :
    props.tone === "neg" ? "text-bear" :
    "text-text";

  return (
    <div className="pane px-4 py-3 min-w-0 flex flex-col justify-between gap-1">
      <div className="pane-heading">{props.label}</div>
      <div className={`metric-value text-2xl ${toneClass}`}>{props.value}</div>
      {props.sub && <div className="text-subtle text-xs font-mono">{props.sub}</div>}
      {props.note && <div className="text-[10px] uppercase tracking-[0.16em] text-bull font-semibold">{props.note}</div>}
      {props.accent && (
        <div className="absolute inset-x-4 top-0 h-0.5 rounded-b-full" style={{ background: props.accent }} />
      )}
    </div>
  );
}

export default function TopStrip() {
  const metrics = useDash(s => s.metrics);
  const symbol = useDash(s => s.symbol);
  const position = useDash(s => s.position);
  const timeline = useDash(s => s.timeline);

  // Timeline is stored newest-first, so the first trade row is the latest.
  const lastTradeTs = useMemo(() => {
    for (const ev of timeline) {
      if (ev.category === "trade") return ev.ts;
    }
    return null;
  }, [timeline]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const lastTradeMs = lastTradeTs != null
    ? now - lastTradeTs
    : metrics
      ? metrics.days_since_last_trade * 86_400_000
      : null;
  const tradingUptimeSeconds = metrics ? metrics.days_since_first_trade * 86_400 : null;

  if (!metrics) {
    return (
      <div className="flex gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="pane px-4 py-3 min-w-0 h-[84px] animate-pulse" />
        ))}
      </div>
    );
  }

  // Use the live mark for the headline PnL cards so they stay in sync with
  // PositionPanel and the chart even between server-side metrics samples.
  const unrealizedLive = position.size > 0
    ? (position.mark - position.avg_entry) * position.size
    : 0;
  const totalPnlLive = metrics.realized_pnl + unrealizedLive;
  const realizedReturnPct = metrics.baseline > 0 ? (metrics.realized_pnl / metrics.baseline) * 100 : 0;
  const latentReturnPct = metrics.baseline > 0 ? (unrealizedLive / metrics.baseline) * 100 : 0;
  const returnPctLive = metrics.baseline > 0 ? (totalPnlLive / metrics.baseline) * 100 : 0;

  const realizedTone = polarity(metrics.realized_pnl) === "pos" ? "pos" : polarity(metrics.realized_pnl) === "neg" ? "neg" : "neutral";
  const realizedReturnTone = polarity(realizedReturnPct) === "pos" ? "pos" : polarity(realizedReturnPct) === "neg" ? "neg" : "neutral";

  return (
    <motion.div
      className="grid grid-cols-4 xl:grid-cols-7 gap-3"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <MetricCard
        label={`${symbol} - PnL`}
        value={fmtUSD(metrics.realized_pnl)}
        sub={`latent ${fmtUSD(unrealizedLive)} - total ${fmtUSD(totalPnlLive)}`}
        tone={realizedTone}
      />
      <MetricCard
        label={`return vs $${metrics.baseline.toFixed(0)}`}
        value={fmtPct(realizedReturnPct)}
        sub={`latent ${fmtPct(latentReturnPct)} - total ${fmtPct(returnPctLive)}`}
        tone={realizedReturnTone}
      />
      <MetricCard
        label="sharpe"
        value={fmtNumber(metrics.sharpe, 2)}
        sub="5m samples"
      />
      <MetricCard
        label="max drawdown"
        value={fmtPct(metrics.max_drawdown_pct)}
        sub={fmtUSD(metrics.max_drawdown)}
        tone={metrics.max_drawdown < 0 ? "neg" : "neutral"}
      />
      <MetricCard
        label="trading uptime"
        value={fmtDuration(tradingUptimeSeconds)}
        sub={lastTradeMs != null ? `last trade ${fmtElapsed(lastTradeMs)} ago` : "last trade -"}
      />
      <MetricCard
        label="win rate"
        value={`${metrics.win_rate.toFixed(1)}%`}
        sub={`avg win ${fmtUSD(metrics.avg_win)} - loss ${fmtUSD(metrics.avg_loss)}`}
        tone={metrics.win_rate > 50 ? "pos" : metrics.win_rate > 0 ? "neutral" : "neg"}
      />
      <MetricCard
        label={`cagr (${metrics.cagr_label})`}
        value={fmtPct(metrics.cagr)}
        sub="annualized"
        tone={polarity(metrics.cagr) === "pos" ? "pos" : polarity(metrics.cagr) === "neg" ? "neg" : "neutral"}
      />
    </motion.div>
  );
}
