import type { Envelope } from "./types";

type Handler = (env: Envelope) => void;

export class DashboardWS {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private stopped = false;
  private backoff = 500;
  private status: "idle" | "connecting" | "open" | "closed" = "idle";
  private statusHandlers = new Set<(s: DashboardWS["status"]) => void>();

  constructor(private readonly url: string) {}

  onMessage(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  onStatus(h: (s: DashboardWS["status"]) => void): () => void {
    this.statusHandlers.add(h);
    h(this.status);
    return () => this.statusHandlers.delete(h);
  }

  private setStatus(s: DashboardWS["status"]) {
    this.status = s;
    this.statusHandlers.forEach(fn => fn(s));
  }

  connect() {
    if (this.stopped) return;
    this.setStatus("connecting");
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.addEventListener("open", () => {
      this.backoff = 500;
      this.setStatus("open");
    });
    this.ws.addEventListener("close", () => {
      this.setStatus("closed");
      this.scheduleReconnect();
    });
    this.ws.addEventListener("error", () => {
      try { this.ws?.close(); } catch { /* noop */ }
    });
    this.ws.addEventListener("message", (ev) => {
      try {
        const env = JSON.parse(ev.data as string) as Envelope;
        this.handlers.forEach(h => h(env));
      } catch {
        // ignore bad frames
      }
    });
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    const delay = Math.min(this.backoff, 10_000);
    setTimeout(() => {
      this.backoff = Math.min(this.backoff * 2, 10_000);
      this.connect();
    }, delay);
  }

  close() {
    this.stopped = true;
    try { this.ws?.close(); } catch { /* noop */ }
    this.setStatus("closed");
  }
}

export function makeWS(): DashboardWS {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${window.location.host}/ws`;
  return new DashboardWS(url);
}
