import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useDash } from "../lib/store";
import type { TimelineEvent } from "../lib/types";
import { formatTradePnl, formatTradePrice, formatTradeQty, tradeFeedTitle } from "../lib/tradeLabels";

const VISIBLE = 10;
const GROUP_WINDOW_MS = 10_000;

type FeedRow = {
  key: string;
  ts: number;
  tailTs: number;
  category: TimelineEvent["category"];
  label: string;
  side: TimelineEvent["side"];
  price: number | null;
  qty: number | null;
  pnl: number | null;
  win_loss: TimelineEvent["win_loss"];
  payload: TimelineEvent["payload"];
  count: number;
};

export default function ActionFeed() {
  const timeline = useDash(s => s.timeline);
  const rows = useMemo(() => groupTimeline(timeline).slice(0, VISIBLE * 6), [timeline]);

  return (
    <div className="pane p-0 flex flex-col min-h-0 h-full">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <span className="pane-heading">action feed</span>
        <span className="text-subtle text-xs font-mono">newest first - {VISIBLE} visible</span>
      </div>
      <div className="relative flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {rows.map((ev, i) => (
            <motion.div
              key={ev.key}
              initial={i === 0 ? { opacity: 0, y: -6, backgroundColor: tintFor(ev) } : false}
              animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="px-4 py-2.5 border-b border-border/60 flex items-start gap-3"
            >
              <TimeCell ts={ev.ts} />
              <Dot ev={ev} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text truncate">{labelFor(ev)}</span>
                  {ev.pnl != null && ev.pnl !== 0 && (
                    <span className={ev.pnl > 0 ? "text-bull font-mono" : "text-bear font-mono"}>
                      {formatTradePnl(ev)}
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-subtle mt-0.5 flex items-center gap-3">
                  {ev.count > 1 && <span>{ev.count} fills</span>}
                  {ev.side && <span className={ev.side === "buy" ? "text-bull" : "text-bear"}>{ev.side.toUpperCase()}</span>}
                  {ev.qty != null && <span>qty {formatTradeQty(ev)}</span>}
                  {ev.price != null && <span>{`${ev.count > 1 ? "avg" : "@"} ${formatTradePrice(ev)}`}</span>}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {rows.length === 0 && (
          <div className="p-8 text-subtle text-sm text-center">no events yet</div>
        )}
      </div>
    </div>
  );
}

function groupTimeline(timeline: TimelineEvent[]): FeedRow[] {
  const grouped: FeedRow[] = [];

  for (const ev of timeline) {
    const last = grouped[grouped.length - 1];
    if (last && canGroup(last, ev)) {
      mergeIntoGroup(last, ev);
      continue;
    }
    grouped.push({
      key: ev.event_id,
      ts: ev.ts,
      tailTs: ev.ts,
      category: ev.category,
      label: ev.label,
      side: ev.side ?? null,
      price: ev.price ?? null,
      qty: ev.qty ?? null,
      pnl: ev.pnl ?? null,
      win_loss: ev.win_loss,
      payload: ev.payload,
      count: 1,
    });
  }

  return grouped;
}

function canGroup(group: FeedRow, ev: TimelineEvent): boolean {
  return (
    group.category === "trade" &&
    ev.category === "trade" &&
    group.side === (ev.side ?? null) &&
    group.label === ev.label &&
    group.win_loss === ev.win_loss &&
    group.tailTs - ev.ts <= GROUP_WINDOW_MS
  );
}

function mergeIntoGroup(group: FeedRow, ev: TimelineEvent): void {
  const prevQty = group.qty ?? 0;
  const eventQty = ev.qty ?? 0;
  const nextQty = prevQty + eventQty;

  if (group.price != null && ev.price != null && prevQty > 0 && nextQty > 0) {
    group.price = ((group.price * prevQty) + (ev.price * eventQty)) / nextQty;
  } else if (group.price == null && ev.price != null) {
    group.price = ev.price;
  }

  if (group.qty != null || ev.qty != null) {
    group.qty = nextQty;
  }
  if (group.pnl != null || ev.pnl != null) {
    group.pnl = (group.pnl ?? 0) + (ev.pnl ?? 0);
  }

  group.tailTs = ev.ts;
  group.count += 1;
}

function labelFor(ev: FeedRow): string {
  const label = ev.category === "trade" ? tradeFeedTitle(ev) : ev.label;
  return ev.count > 1 ? `${label} x${ev.count}` : label;
}

function tintFor(ev: Pick<FeedRow, "category" | "win_loss">): string {
  if (ev.win_loss === "win") return "rgba(52, 211, 153, 0.12)";
  if (ev.win_loss === "loss") return "rgba(248, 113, 113, 0.12)";
  if (ev.category === "order") return "rgba(96, 165, 250, 0.08)";
  return "rgba(148, 163, 184, 0.06)";
}

function Dot({ ev }: { ev: Pick<FeedRow, "side" | "win_loss"> }) {
  let color = "#64748b";
  if (ev.win_loss === "win") color = "#10b981";
  else if (ev.win_loss === "loss") color = "#ef4444";
  else if (ev.side === "buy") color = "#34d399";
  else if (ev.side === "sell") color = "#f87171";
  return <span className="mt-1.5 w-2 h-2 rounded-full flex-none" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />;
}

function TimeCell({ ts }: { ts: number }) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", timeZone: "UTC" });
  return (
    <span className="font-mono w-24 tabular-nums select-none leading-tight flex flex-col">
      <span className="text-xs text-text/90 font-semibold">{time}</span>
      <span className="text-[11px] text-subtle">{date} UTC</span>
    </span>
  );
}
