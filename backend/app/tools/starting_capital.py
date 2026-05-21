"""Manual starting-capital management CLI.

Examples:
    python -m app.tools.starting_capital show
    python -m app.tools.starting_capital set 651.86 --note "manual account start"
    python -m app.tools.starting_capital clear
    python -m app.tools.starting_capital discover
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from typing import Any

from ..collector.ssh_client import make_transport
from ..config import settings
from ..persistence import repos
from ..persistence.db import db

BALANCE_RE = re.compile(r"balance=([0-9]+(?:\.[0-9]+)?)\s+USDC")


def _print_state(prefix: str, state: object) -> None:
    if state is None:
        print(f"{prefix}: none")
        return
    if hasattr(state, "model_dump"):
        print(f"{prefix}: {json.dumps(state.model_dump(), sort_keys=True)}")
    else:
        print(f"{prefix}: {state}")


def _extract_pnl_records(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        records = data
    elif isinstance(data, dict):
        records = data.get("fills") or data.get("data") or data.get("pnls") or []
    else:
        records = []
    return [r for r in records if isinstance(r, dict)]


def _sum_realized_pnl(data: bytes) -> float:
    records = _extract_pnl_records(json.loads(data.decode()))
    total = 0.0
    for record in records:
        total += float(record.get("pnl") or record.get("realized_pnl") or 0.0)
    return total


def _latest_health_balance(data: bytes) -> float | None:
    balance: float | None = None
    for line in data.decode(errors="replace").splitlines():
        match = BALANCE_RE.search(line)
        if match:
            balance = float(match.group(1))
    return balance


async def _discover_candidate(timeout: float) -> dict[str, Any]:
    if not settings.ssh_target_configured:
        return {"available": False, "reason": "VPS_HOST is not configured"}

    transport = make_transport()
    try:
        pnl_data, health_data = await asyncio.wait_for(
            asyncio.gather(
                transport.read_file(settings.pnls_remote_path),
                transport.health_lines(settings.debug_log_remote_path),
            ),
            timeout=timeout,
        )
    finally:
        await transport.close()

    realized = _sum_realized_pnl(pnl_data)
    current_balance = _latest_health_balance(health_data)
    if current_balance is None:
        return {"available": False, "reason": "no health balance found"}

    candidate = current_balance - realized
    return {
        "available": True,
        "source": "health_balance_minus_realized_pnl",
        "current_balance": current_balance,
        "realized_pnl": realized,
        "candidate_starting_capital": candidate,
        "note": "read-only candidate; not applied automatically",
    }


async def _show() -> None:
    stored = await repos.get_starting_capital_state()
    effective = await repos.resolve_starting_capital()
    _print_state("stored", stored)
    _print_state("effective", effective)


async def _set(value: float, note: str | None) -> None:
    async with repos.transaction():
        state = await repos.set_starting_capital(value, note=note)
    _print_state("stored", state)


async def _clear() -> None:
    async with repos.transaction():
        await repos.clear_starting_capital()
    print("stored: cleared")
    _print_state("effective", await repos.resolve_starting_capital())


async def _main_async(args: argparse.Namespace) -> int:
    await db.connect()
    try:
        if args.command == "show":
            await _show()
        elif args.command == "set":
            await _set(args.value, args.note)
        elif args.command == "clear":
            await _clear()
        elif args.command == "discover":
            candidate = await _discover_candidate(args.timeout)
            print(f"candidate: {json.dumps(candidate, sort_keys=True)}")
        else:
            raise ValueError(f"unknown command: {args.command}")
    finally:
        await db.close()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage dashboard starting capital.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("show", help="Show stored and effective starting capital.")

    set_parser = sub.add_parser("set", help="Set the authoritative starting capital.")
    set_parser.add_argument("value", type=float)
    set_parser.add_argument("--note", default=None)

    sub.add_parser("clear", help="Clear stored starting capital and return to fallback.")

    discover_parser = sub.add_parser("discover", help="Print a read-only remote candidate.")
    discover_parser.add_argument("--timeout", type=float, default=20.0)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return asyncio.run(_main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
