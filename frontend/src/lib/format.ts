export const fmtUSD = (n: number | null | undefined, digits = 2): string => {
  if (n == null || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};

export const fmtPct = (n: number | null | undefined, digits = 2): string => {
  if (n == null || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(digits)}%`;
};

export const fmtNumber = (n: number | null | undefined, digits = 4): string => {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export const fmtDuration = (secs: number | null | undefined): string => {
  if (secs == null || !isFinite(secs)) return "—";
  const s = Math.max(0, secs);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const fmtDays = (d: number | null | undefined): string => {
  if (d == null || !isFinite(d)) return "—";
  if (d < 1) return `${(d * 24).toFixed(1)}h`;
  return `${d.toFixed(1)}d`;
};

/** Human-readable elapsed time that scales with magnitude.
 *  <60s  → "42s"
 *  <60m  → "3m 20s" (seconds dropped once we hit 10m to avoid jitter)
 *  <24h  → "4h 12m"
 *  <7d   → "3d 6h"
 *  else  → "42d"
 */
export const fmtElapsed = (ms: number | null | undefined): string => {
  if (ms == null || !isFinite(ms)) return "—";
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const min = Math.floor(total / 60);
  if (min < 10) {
    const s = total % 60;
    return s ? `${min}m ${s.toString().padStart(2, "0")}s` : `${min}m`;
  }
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    const m = min % 60;
    return m ? `${hr}h ${m.toString().padStart(2, "0")}m` : `${hr}h`;
  }
  const d = Math.floor(hr / 24);
  if (d < 7) {
    const h = hr % 24;
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  return `${d}d`;
};

export const fmtTimeShort = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false });
};

export const polarity = (n: number | null | undefined): "pos" | "neg" | "zero" => {
  if (n == null) return "zero";
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "zero";
};
