export class DashboardWS {
    url;
    ws = null;
    handlers = new Set();
    stopped = false;
    backoff = 500;
    status = "idle";
    statusHandlers = new Set();
    constructor(url) {
        this.url = url;
    }
    onMessage(h) {
        this.handlers.add(h);
        return () => this.handlers.delete(h);
    }
    onStatus(h) {
        this.statusHandlers.add(h);
        h(this.status);
        return () => this.statusHandlers.delete(h);
    }
    setStatus(s) {
        this.status = s;
        this.statusHandlers.forEach(fn => fn(s));
    }
    connect() {
        if (this.stopped)
            return;
        this.setStatus("connecting");
        try {
            this.ws = new WebSocket(this.url);
        }
        catch {
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
            try {
                this.ws?.close();
            }
            catch { /* noop */ }
        });
        this.ws.addEventListener("message", (ev) => {
            try {
                const env = JSON.parse(ev.data);
                this.handlers.forEach(h => h(env));
            }
            catch {
                // ignore bad frames
            }
        });
    }
    scheduleReconnect() {
        if (this.stopped)
            return;
        const delay = Math.min(this.backoff, 10_000);
        setTimeout(() => {
            this.backoff = Math.min(this.backoff * 2, 10_000);
            this.connect();
        }, delay);
    }
    close() {
        this.stopped = true;
        try {
            this.ws?.close();
        }
        catch { /* noop */ }
        this.setStatus("closed");
    }
}
export function makeWS() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws`;
    return new DashboardWS(url);
}
