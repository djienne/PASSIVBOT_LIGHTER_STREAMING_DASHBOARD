import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useDash } from "../lib/store";
import { fmtDays, fmtElapsed, fmtNumber, fmtPct, fmtUSD, polarity } from "../lib/format";

function MetricCard(props: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg" | "neutral";
  accent?: string;
}) {
  const toneClass =
    props.tone === "pos" ? "text-bull" :
    props.tone === "neg" ? "text-bear" :
    "text-text";
  return (
    <div className="pane px-4 py-3 min-w-[160px] flex-1 flex flex-col justify-between gap-1">
      <div className="pane-heading">{props.label}</div>
      <div className={`metric-value text-2xl ${toneClass}`}>{props.value}</div>
      {props.sub && <div className="text-subtle text-xs font-mono">{props.sub}</div>}
      {props.accent && (
        <div className="absolute inset-x-4 top-0 h-0.5 rounded-b-full" style={{ background: props.accent }} />
      )}
    </div>
  );
}

export default function TopStrip() {
  const m = useDash(s => s.metrics);
  const sym = useDash(s => s.symbol);
  const baseline = useDash(s => s.baseline);
  const balance = useDash(s => s.balance);
  const position = useDash(s => s.position);
  const timeline = useDash(s => s.timeline);

  // Most recent fill timestamp — timeline is stored newest-first, so the
  // first `trade` entry is the latest. Fall back to the server's
  // `days_since_last_trade` if we don't have a timeline entry yet (fresh
  // cold start before any WS events).
  const lastTradeTs = useMemo(() => {
    for (const ev of timeline) {
      if (ev.category === "trade") return ev.ts;
    }
    return null;
  }, [timeline]);

  // Tick once per second so the "time since last trade" card has live
  // second-precision when the gap is small. At ~1 render/s for ~80 B of
  // text this is free.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const lastTradeMs = lastTradeTs != null
    ? now - lastTradeTs
    : m
      ? m.days_since_last_trade * 86_400_000
      : null;

  if (!m) {
    return (
      <div className="flex gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="pane px-4 py-3 min-w-[160px] flex-1 h-[84px] animate-pulse" />
        ))}
      </div>
    );
  }

  // Derive unrealized + totals from the live mark (updated on every ticker
  // frame) rather than the 5-min-old server metrics snapshot. Keeps the
  // PnL card perfectly in sync with PositionPanel and the mark-price line
  // on the chart.
  const unrealizedLive = position.size > 0
    ? (position.mark - position.avg_entry) * position.size
    : 0;
  const totalPnlLive = m.realized_pnl + unrealizedLive;
  const returnPctLive = baseline > 0 ? (totalPnlLive / baseline) * 100 : 0;

  const totalTone  = polarity(totalPnlLive) === "pos" ? "pos" : polarity(totalPnlLive) === "neg" ? "neg" : "neutral";
  const returnTone = polarity(returnPctLive) === "pos" ? "pos" : polarity(returnPctLive) === "neg" ? "neg" : "neutral";

  return (
    <motion.div
      className="grid grid-cols-4 xl:grid-cols-7 gap-3"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <MetricCard
        label={`${sym} — total PnL`}
        value={fmtUSD(totalPnlLive)}
        sub={`realized ${fmtUSD(m.realized_pnl)} · unrealized ${fmtUSD(unrealizedLive)}`}
        tone={totalTone}
      />
      <MetricCard
        label={`return vs $${baseline.toFixed(0)}`}
        value={fmtPct(returnPctLive)}
        sub={balance ? `balance ${fmtUSD(balance.balance)}` : "balance —"}
        tone={returnTone}
      />
      <MetricCard
        label="sharpe"
        value={fmtNumber(m.sharpe, 2)}
        sub="0% rf · 5m samples"
      />
      <MetricCard
        label="max drawdown"
        value={fmtPct(m.max_drawdown_pct)}
        sub={fmtUSD(m.max_drawdown)}
        tone={m.max_drawdown < 0 ? "neg" : "neutral"}
      />
      <MetricCard
        label="time since last trade"
        value={fmtElapsed(lastTradeMs)}
        sub={`trading for ${fmtDays(m.days_since_first_trade)}`}
      />
      <MetricCard
        label="win rate"
        value={`${m.win_rate.toFixed(1)}%`}
        sub={`avg win ${fmtUSD(m.avg_win)} · loss ${fmtUSD(m.avg_loss)}`}
        tone={m.win_rate > 50 ? "pos" : m.win_rate > 0 ? "neutral" : "neg"}
      />
      <MetricCard
        label={`cagr (${m.cagr_label})`}
        value={fmtPct(m.cagr)}
        sub={`exposure ${m.exposure_pct.toFixed(1)}%`}
        tone={polarity(m.cagr) === "pos" ? "pos" : polarity(m.cagr) === "neg" ? "neg" : "neutral"}
      />
    </motion.div>
  );
}
