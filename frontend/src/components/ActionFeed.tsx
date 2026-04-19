import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useDash } from "../lib/store";
import type { TimelineEvent } from "../lib/types";
import { fmtNumber, fmtTimeShort, fmtUSD } from "../lib/format";

const VISIBLE = 10;

export default function ActionFeed() {
  const timeline = useDash(s => s.timeline);

  const rows = useMemo(() => timeline.slice(0, VISIBLE * 6), [timeline]);

  return (
    <div className="pane p-0 flex flex-col min-h-0 h-full">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <span className="pane-heading">action feed</span>
        <span className="text-subtle text-xs font-mono">newest first · {VISIBLE} visible</span>
      </div>
      <div className="relative flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {rows.map((ev, i) => (
            <motion.div
              key={ev.event_id}
              initial={i === 0 ? { opacity: 0, y: -6, backgroundColor: tintFor(ev) } : false}
              animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className={"px-4 py-2.5 border-b border-border/60 flex items-start gap-3"}
            >
              <TimeCell ts={ev.ts} />
              <Dot ev={ev} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text truncate">{ev.label}</span>
                  {ev.pnl != null && ev.pnl !== 0 && (
                    <span className={ev.pnl > 0 ? "text-bull font-mono" : "text-bear font-mono"}>
                      {fmtUSD(ev.pnl, 2)}
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-subtle mt-0.5 flex items-center gap-3">
                  {ev.side && <span className={ev.side === "buy" ? "text-bull" : "text-bear"}>{ev.side.toUpperCase()}</span>}
                  {ev.qty != null && <span>qty {fmtNumber(ev.qty, 4)}</span>}
                  {ev.price != null && <span>@ ${ev.price.toFixed(4)}</span>}
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

function tintFor(ev: TimelineEvent): string {
  if (ev.win_loss === "win") return "rgba(52, 211, 153, 0.12)";
  if (ev.win_loss === "loss") return "rgba(248, 113, 113, 0.12)";
  if (ev.category === "order") return "rgba(96, 165, 250, 0.08)";
  return "rgba(148, 163, 184, 0.06)";
}

function Dot({ ev }: { ev: TimelineEvent }) {
  let color = "#64748b";
  if (ev.win_loss === "win") color = "#10b981";
  else if (ev.win_loss === "loss") color = "#ef4444";
  else if (ev.side === "buy") color = "#34d399";
  else if (ev.side === "sell") color = "#f87171";
  return <span className="mt-1.5 w-2 h-2 rounded-full flex-none" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />;
}

function TimeCell({ ts }: { ts: number }) {
  return <span className="text-[11px] font-mono text-dim w-16 tabular-nums select-none">{fmtTimeShort(ts)}</span>;
}
