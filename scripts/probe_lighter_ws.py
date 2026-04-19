#!/usr/bin/env python3
"""Phase 0 — probe Lighter public WebSocket for HYPE market data.

From the VPS bot logs we already know:
  URL      = wss://mainnet.zklighter.elliot.ai/stream
  channel  = "ticker:<market_id>"  e.g. ticker:24 (HYPE = market_id 24)
  subscribe format = {"type": "subscribe", "channel": "ticker:24"}

This probe confirms the schema, records the first few ticker frames, and
additionally tries candle/orderbook channels to see what else is live.
Output is written to data/fixtures/lighter_ws_snapshot.sample.json.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

try:
    import websockets
except ImportError:
    sys.exit("pip install websockets")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fixtures" / "lighter_ws_snapshot.sample.json"

WS_URL = "wss://mainnet.zklighter.elliot.ai/stream"
MARKET_ID = 24  # HYPE

SUBSCRIPTIONS = [
    {"type": "subscribe", "channel": f"ticker/{MARKET_ID}"},
    {"type": "subscribe", "channel": f"order_book/{MARKET_ID}"},
]

MAX_SECONDS = 15
MAX_MESSAGES = 80


async def probe() -> dict:
    snap: dict = {
        "url": WS_URL,
        "market_id": MARKET_ID,
        "started_at": time.time(),
        "ok": False,
        "subscriptions_sent": SUBSCRIPTIONS,
        "messages": [],
        "channels_seen": {},
        "error": None,
    }
    try:
        async with websockets.connect(WS_URL, ping_interval=15, close_timeout=5) as ws:
            for sub in SUBSCRIPTIONS:
                await ws.send(json.dumps(sub))
            deadline = time.monotonic() + MAX_SECONDS
            while time.monotonic() < deadline and len(snap["messages"]) < MAX_MESSAGES:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                except asyncio.TimeoutError:
                    break
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    msg = {"_raw": raw[:2048]}
                snap["messages"].append(msg)
                ch = msg.get("channel") or msg.get("type") or "?"
                snap["channels_seen"][ch] = snap["channels_seen"].get(ch, 0) + 1
            snap["ok"] = bool(snap["messages"])
    except Exception as exc:  # noqa: BLE001
        snap["error"] = f"{type(exc).__name__}: {exc}"
    snap["finished_at"] = time.time()
    return snap


def summarize(snap: dict) -> None:
    print(f"URL: {snap['url']}  market_id={snap['market_id']}")
    if snap["error"]:
        print(f"ERROR: {snap['error']}")
    print(f"messages received:  {len(snap['messages'])}")
    for ch, count in sorted(snap["channels_seen"].items(), key=lambda x: -x[1]):
        print(f"  {ch}: {count}")
    # print unique message types (keys of first msg per channel)
    print("\nsample message per channel:")
    seen_ch = set()
    for m in snap["messages"]:
        ch = m.get("channel") or m.get("type") or "?"
        if ch in seen_ch:
            continue
        seen_ch.add(ch)
        preview = json.dumps(m, default=str)[:300]
        print(f"  [{ch}] {preview}")


def main() -> int:
    snap = asyncio.run(probe())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snap, indent=2, default=str))
    print(f"snapshot written to {OUT.relative_to(ROOT)}\n")
    summarize(snap)
    return 0 if snap["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
