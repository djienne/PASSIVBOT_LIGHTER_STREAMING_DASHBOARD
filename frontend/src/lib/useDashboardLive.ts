import { useEffect } from "react";
import { fetchBootstrap, fetchBootstrapDelta } from "./api";
import { useDash } from "./store";
import type { Envelope } from "./types";
import { makeWS } from "./ws";
import type { DashboardWS } from "./ws";

export function useDashboardLive() {
  const applyBootstrap = useDash(s => s.applyBootstrap);
  const applyBootstrapDelta = useDash(s => s.applyBootstrapDelta);
  const applyEnvelope = useDash(s => s.applyEnvelope);
  const setWSStatus = useDash(s => s.setWSStatus);

  useEffect(() => {
    let cancelled = false;
    let bootRetry: number | null = null;
    let deltaRetry: number | null = null;
    let ws: DashboardWS | null = null;
    let offMsg: (() => void) | null = null;
    let offStatus: (() => void) | null = null;
    let syncing = false;
    let wasEverOpen = false;
    let hadDisconnect = false;
    const buffered: Envelope[] = [];

    const flushBuffered = () => {
      const queued = buffered.splice(0);
      for (const env of queued) useDash.getState().applyEnvelope(env);
    };

    const syncDelta = async (since: number) => {
      syncing = true;
      try {
        let nextSince = since;
        while (!cancelled) {
          const delta = await fetchBootstrapDelta(nextSince);
          if (cancelled) return;
          applyBootstrapDelta(delta);
          if (!delta.has_more) break;
          if (delta.cursor <= nextSince) break;
          nextSince = delta.cursor;
        }
      } catch {
        if (!cancelled) {
          deltaRetry = window.setTimeout(() => {
            void syncDelta(since);
          }, 2000);
        }
      } finally {
        syncing = false;
        if (!cancelled) flushBuffered();
      }
    };

    const boot = async () => {
      syncing = true;
      try {
        const bootstrap = await fetchBootstrap();
        if (cancelled) return;
        applyBootstrap(bootstrap);
      } catch {
        syncing = false;
        if (!cancelled) {
          bootRetry = window.setTimeout(() => {
            void boot();
          }, 2000);
        }
        return;
      }
      syncing = false;
      flushBuffered();
      if (cancelled) return;

      ws = makeWS();
      offMsg = ws.onMessage(env => {
        if (syncing) buffered.push(env);
        else applyEnvelope(env);
      });
      offStatus = ws.onStatus(status => {
        setWSStatus(status);
        if (status === "closed") {
          hadDisconnect = true;
          return;
        }
        if (status !== "open") return;

        const shouldCatchUp = hadDisconnect || !wasEverOpen;
        hadDisconnect = false;
        wasEverOpen = true;
        if (shouldCatchUp) {
          const since = useDash.getState().cursor;
          void syncDelta(since);
        }
      });
      ws.connect();
    };

    void boot();

    return () => {
      cancelled = true;
      if (bootRetry != null) window.clearTimeout(bootRetry);
      if (deltaRetry != null) window.clearTimeout(deltaRetry);
      offMsg?.();
      offStatus?.();
      ws?.close();
    };
  }, [applyBootstrap, applyBootstrapDelta, applyEnvelope, setWSStatus]);
}
