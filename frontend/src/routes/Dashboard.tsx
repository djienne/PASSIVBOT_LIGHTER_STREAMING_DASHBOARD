import { useEffect } from "react";
import { Link } from "react-router-dom";
import TopStrip from "../components/TopStrip";
import ChartPanel from "../components/ChartPanel";
import PnlCurvePanel from "../components/PnlCurvePanel";
import PositionPanel from "../components/PositionPanel";
import OrdersPanel from "../components/OrdersPanel";
import ActionFeed from "../components/ActionFeed";
import HealthFooter from "../components/HealthFooter";
import VpsLatencyChip from "../components/VpsLatencyChip";
import CurrentTimeChip from "../components/CurrentTimeChip";
import AnimationCoordinator from "../components/anim/AnimationCoordinator";
import DebugGifButton from "../components/DebugGifButton";
import { fetchBootstrap } from "../lib/api";
import { makeWS } from "../lib/ws";
import { useDash } from "../lib/store";

export default function Dashboard() {
  const applyBootstrap = useDash(s => s.applyBootstrap);
  const applyEnvelope = useDash(s => s.applyEnvelope);
  const setWSStatus = useDash(s => s.setWSStatus);

  useEffect(() => {
    let cancelled = false;
    let reboot: number | null = null;

    const boot = async () => {
      try {
        const b = await fetchBootstrap();
        if (!cancelled) applyBootstrap(b);
      } catch {
        if (!cancelled) reboot = window.setTimeout(boot, 2000);
      }
    };
    boot();

    const ws = makeWS();
    const offMsg = ws.onMessage(env => applyEnvelope(env));
    const offStatus = ws.onStatus(setWSStatus);
    ws.connect();

    return () => {
      cancelled = true;
      if (reboot) window.clearTimeout(reboot);
      offMsg();
      offStatus();
      ws.close();
    };
  }, [applyBootstrap, applyEnvelope, setWSStatus]);

  return (
    <div className="min-h-full p-4 md:p-6 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1.5">
            <img
              src="/pbot_logo_full.svg"
              alt="Passivbot"
              className="h-9 w-auto select-none"
              draggable={false}
            />
            <img
              src="/light_logo_full.svg"
              alt="Lighter"
              className="h-6 w-auto select-none opacity-90"
              draggable={false}
            />
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-[0.2em] text-subtle">on Lighter - HYPE</span>
            <span className="text-xl font-display font-semibold">live dashboard</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-2">
            <CurrentTimeChip />
            <VpsLatencyChip />
          </div>
          <Link to="/stream" className="chip-neutral hover:border-accent hover:text-accent transition">
            {"stream mode ->"}
          </Link>
        </div>
      </header>

      <TopStrip />

      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) 360px" }}>
        <div className="flex flex-col gap-4">
          <div className="h-[560px] min-h-[560px] grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
            <PnlCurvePanel />
            <ChartPanel />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <PositionPanel />
            <OrdersPanel />
          </div>
        </div>
        <div className="h-[820px] min-h-[820px]">
          <ActionFeed />
        </div>
      </div>

      <HealthFooter />
      <AnimationCoordinator />
      <DebugGifButton />
    </div>
  );
}
