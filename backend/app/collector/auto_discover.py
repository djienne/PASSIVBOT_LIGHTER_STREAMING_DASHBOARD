"""One-shot auto-discovery of starting capital.

Subscribes to ``balance.update``; on the first event, computes
``starting_capital = balance - sum(fills.pnl)`` and persists the result.
Exits immediately if a value is already stored in the DB.
"""

from __future__ import annotations

from ..events.bus import bus
from ..logging import log
from ..metrics.pnl import reconstruct_pnl_from_fills
from ..persistence import repos


async def auto_discover_starting_capital() -> None:
    stored = await repos.get_starting_capital_state()
    if stored is not None:
        log.info(
            "auto_discover: starting capital already stored, skipping",
            value=stored.value,
            source=stored.source,
        )
        return

    log.info("auto_discover: no stored starting capital, waiting for first balance.update")

    async for _topic, _payload in bus.subscribe("balance.update"):
        # Use the latest balance from DB, not the event payload — log_tail
        # commits an entire batch (which may include stale rotated-log lines)
        # before publishing events, so the DB already has the newest snapshot.
        latest = await repos.latest_balance()
        if latest is None:
            continue
        balance = latest.balance

        fills = await repos.all_fills()
        if fills and all(f.pnl == 0 for f in fills):
            fills = reconstruct_pnl_from_fills(fills)
        realized_pnl = sum(f.pnl for f in fills)

        candidate = balance - realized_pnl

        log.info(
            "auto_discover: computed candidate",
            balance=balance,
            realized_pnl=realized_pnl,
            fills_count=len(fills),
            candidate=candidate,
        )

        try:
            repos.validate_starting_capital(candidate)
        except ValueError:
            log.warning(
                "auto_discover: candidate rejected, will retry on next balance",
                candidate=candidate,
            )
            continue

        async with repos.transaction():
            race_check = await repos.get_starting_capital_state()
            if race_check is not None:
                log.info(
                    "auto_discover: another source set starting capital while waiting, skipping",
                    value=race_check.value,
                    source=race_check.source,
                )
                return

            note = (
                f"auto: balance={balance:.2f}, "
                f"realized_pnl={realized_pnl:.2f}, "
                f"fills={len(fills)}"
            )
            await repos.set_starting_capital(
                candidate,
                source="auto_discover",
                note=note,
            )

        log.info(
            "auto_discover: starting capital persisted",
            value=candidate,
        )
        return
