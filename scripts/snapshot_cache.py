#!/usr/bin/env python3
"""Phase 0 — download every relevant cache file into data/fixtures/ for replay tests.

Requires: ssh + scp on PATH, infos/lighter.pem readable.
Usage:    python scripts/snapshot_cache.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY = Path(os.environ.get("SSH_KEY_PATH", ROOT / "infos" / "lighter.pem"))
HOST = os.environ.get("VPS_HOST", "54.95.246.213")
USER = os.environ.get("VPS_USER", "ubuntu")
REMOTE_DIR = os.environ.get("REMOTE_DIR", "/home/ubuntu/passivbot_lighter")
OUT = ROOT / "data" / "fixtures"
SSH_OPTS = ["-i", str(KEY), "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes"]


def ssh(cmd: str) -> str:
    res = subprocess.run(
        ["ssh", *SSH_OPTS, f"{USER}@{HOST}", cmd],
        capture_output=True, text=True, check=False,
    )
    if res.returncode != 0:
        sys.exit(f"ssh failed: {res.stderr}")
    return res.stdout


def scp(remote: str, local: Path) -> None:
    local.parent.mkdir(parents=True, exist_ok=True)
    res = subprocess.run(
        ["scp", *SSH_OPTS, f"{USER}@{HOST}:{remote}", str(local)],
        capture_output=True, text=True, check=False,
    )
    if res.returncode != 0:
        print(f"  ! scp {remote} failed: {res.stderr.strip()}")
    else:
        print(f"  + {local.relative_to(ROOT)}")


def main() -> int:
    if not KEY.exists():
        sys.exit(f"key not found: {KEY}")

    OUT.mkdir(parents=True, exist_ok=True)
    print(f"scanning {REMOTE_DIR}/caches ...")
    listing = ssh(
        f"find {REMOTE_DIR}/caches -maxdepth 3 -type f "
        f"\\( -name '*.json' -o -name '*.jsonl' -o -name '*.ndjson' \\) 2>/dev/null"
    ).splitlines()

    for remote in listing:
        remote = remote.strip()
        if not remote:
            continue
        local = OUT / Path(remote).name
        scp(remote, local)

    print(f"\nsnapshot saved under {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
