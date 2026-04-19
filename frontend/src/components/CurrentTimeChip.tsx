import { useEffect, useState } from "react";

/** Live-ticking UTC clock with second precision. Paired above the
 *  VPS latency chip so broadcast viewers have a trustworthy timestamp
 *  to cross-reference the dashboard's live state against the market. */
export default function CurrentTimeChip() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");

  return (
    <div
      className="pane px-4 py-2 flex items-center gap-3"
      title={`Live UTC clock · ticking once per second in the browser`}
    >
      <span
        className="w-2 h-2 rounded-full flex-none bg-accent"
        style={{ boxShadow: "0 0 8px #60a5fa" }}
      />
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-widest text-subtle">
          current time (UTC)
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="metric-value font-mono text-xl text-text">
            {hh}:{mi}:{ss}
          </span>
          <span className="text-subtle text-xs font-mono ml-1">
            {yyyy}-{mm}-{dd}
          </span>
        </div>
      </div>
    </div>
  );
}
