import { useEffect } from "react";
import { fetchBootstrap } from "./api";
import { useDash } from "./store";
import type { Envelope } from "./types";
import { makeWS } from "./ws";
import type { DashboardWS } from "./ws";

export function useDashboardLive() {
  const applyBootstrap = useDash(s => s.applyBootstrap);
  const applyEnvelope = useDash(s => s.applyEnvelope);
  const setWSStatus = useDash(s => s.setWSStatus);

  useEffect(() => {
    let cancelled = false;
    let bootRetry: number | null = null;
    let syncRetry: number | null = null;
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

    const syncBootstrap = async (retryOnFailure: boolean): Promise<boolean> => {
      syncing = true;
      try {
        const bootstrap = await fetchBootstrap();
        if (cancelled) return false;
        applyBootstrap(bootstrap);
        return true;
      } catch {
        if (!cancelled && retryOnFailure) {
          syncRetry = window.setTimeout(() => {
            void syncBootstrap(true);
          }, 2000);
        }
        return false;
      } finally {
        syncing = false;
        if (!cancelled) flushBuffered();
      }
    };

    const boot = async () => {
      const ok = await syncBootstrap(false);
      if (!ok) {
        if (!cancelled) bootRetry = window.setTimeout(() => { void boot(); }, 2000);
        return;
      }
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
          void syncBootstrap(true);
        }
      });
      ws.connect();
    };

    void boot();

    return () => {
      cancelled = true;
      if (bootRetry != null) window.clearTimeout(bootRetry);
      if (syncRetry != null) window.clearTimeout(syncRetry);
      offMsg?.();
      offStatus?.();
      ws?.close();
    };
  }, [applyBootstrap, applyEnvelope, setWSStatus]);
}
