#!/usr/bin/env python3
"""Push a fake timeline event into the running backend via a REST side-door.

Used to demo animations (entry, win, loss, order) without needing a real
trade. Requires an auth token to prevent misuse; for local dev the token
is empty.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["entry", "win", "loss", "order"], default="win")
    ap.add_argument("--pnl", type=float, default=1.23)
    ap.add_argument("--url", default="http://127.0.0.1:8787/api/dev/inject")
    args = ap.parse_args()

    body = json.dumps({"kind": args.kind, "pnl": args.pnl}).encode()
    req = urllib.request.Request(args.url, data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            print(r.read().decode())
    except Exception as e:
        sys.exit(f"failed: {e}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
