import type { Bootstrap, BootstrapDelta, PnlCurveResponse } from "./types";

export async function fetchBootstrap(): Promise<Bootstrap> {
  const res = await fetch("/api/bootstrap");
  if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
  return res.json();
}

export async function fetchBootstrapDelta(since: number): Promise<BootstrapDelta> {
  const res = await fetch(`/api/bootstrap?since=${since}`);
  if (!res.ok) throw new Error(`bootstrap delta failed: ${res.status}`);
  return res.json();
}

export async function fetchHealth(): Promise<Record<string, unknown>> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health failed: ${res.status}`);
  return res.json();
}

export async function fetchPnlCurve(): Promise<PnlCurveResponse> {
  const res = await fetch("/api/pnl-curve");
  if (!res.ok) throw new Error(`pnl curve failed: ${res.status}`);
  return res.json();
}
