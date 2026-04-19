import { useEffect } from "react";
import TopStrip from "../components/TopStrip";
import ChartPanel from "../components/ChartPanel";
import PnlCurvePanel from "../components/PnlCurvePanel";
import PositionPanel from "../components/PositionPanel";
import OrdersPanel from "../components/OrdersPanel";
import ActionFeed from "../components/ActionFeed";
import HealthFooter from "../components/HealthFooter";
import VpsLatencyChip from "../components/VpsLatencyChip";
import AnimationCoordinator from "../components/anim/AnimationCoordinator";
import { fetchBootstrap } from "../lib/api";
import { makeWS } from "../lib/ws";
import { useDash } from "../lib/store";

/** Locked 1920x1080 broadcast layout for OBS capture. No cursor, no scroll, no chrome. */
export default function Stream() {
  const applyBootstrap = useDash(s => s.applyBootstrap);
  const applyEnvelope  = useDash(s => s.applyEnvelope);
  const setWSStatus    = useDash(s => s.setWSStatus);

  useEffect(() => {
    document.body.classList.add("stream-root");
    const style = document.createElement("style");
    style.innerHTML = `
      html, body, #root { cursor: none; overflow: hidden; }
    `;
    document.head.appendChild(style);

    let cancelled = false;
    const boot = async () => {
      try {
        const b = await fetchBootstrap();
        if (!cancelled) applyBootstrap(b);
      } catch {
        if (!cancelled) setTimeout(boot, 2000);
      }
    };
    boot();
    const ws = makeWS();
    const offMsg = ws.onMessage(e => applyEnvelope(e));
    const offStatus = ws.onStatus(setWSStatus);
    ws.connect();

    return () => {
      cancelled = true;
      offMsg();
      offStatus();
      ws.close();
      document.body.classList.remove("stream-root");
      style.remove();
    };
  }, [applyBootstrap, applyEnvelope, setWSStatus]);

  return (
    <div
      className="stream-root relative mx-auto overflow-hidden"
      style={{ width: 1920, height: 1080 }}
    >
      <div className="absolute inset-0 p-6 grid gap-4" style={{
        gridTemplateRows: "auto 1fr auto",
      }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <img
              src="/pbot_logo_full.svg"
              alt="Passivbot"
              className="h-11 w-auto select-none"
              draggable={false}
            />
            <div className="w-px h-10 bg-border" />
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-subtle">on Lighter · HYPE</div>
              <div className="text-3xl font-display font-semibold">live dashboard</div>
            </div>
            <div className="ml-4"><VpsLatencyChip /></div>
          </div>
          <TopStrip />
        </div>

        <div className="grid gap-4 min-h-0" style={{ gridTemplateColumns: "minmax(0,1fr) 420px" }}>
          <div className="grid gap-4 min-h-0" style={{ gridTemplateRows: "1fr 260px" }}>
            <div className="grid gap-4 min-h-0" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
              <PnlCurvePanel />
              <ChartPanel />
            </div>
            <div className="grid grid-cols-2 gap-4 min-h-0">
              <PositionPanel />
              <OrdersPanel />
            </div>
          </div>
          <ActionFeed />
        </div>

        <HealthFooter />
      </div>
      <AnimationCoordinator />
    </div>
  );
}
