"""Classify fills into user-facing trade actions and timeline events."""

from __future__ import annotations

from typing import Literal

from ..models import FillEvent, TimelineEvent

TradeAction = Literal["entry", "dca", "partial_exit", "full_exit", "exit_unknown"]

EPS = 1e-9


def parse_symbol_units(symbol: str, *, default_base: str = "HYPE", default_quote: str = "USDC") -> tuple[str, str]:
    """Return display units for a market symbol like ``HYPE/USDC:USDC``."""
    base = default_base
    quote = default_quote

    if "/" in symbol:
        left, right = symbol.split("/", 1)
        base = left.strip() or base
        if ":" in right:
            quote_part = right.split(":", 1)[1]
        else:
            quote_part = right
        quote_part = quote_part.split("-", 1)[0].strip()
        quote = quote_part or quote

    return base, quote


def _win_loss(fill: FillEvent) -> tuple[str, str]:
    if fill.side == "buy":
        return "entry fill", "neutral"
    if fill.pnl > 0:
        return "winning close", "win"
    if fill.pnl < 0:
        return "losing close", "loss"
    return "close fill", "neutral"


def _label_for_action(action: TradeAction, fill: FillEvent) -> str:
    if action == "entry":
        return "entry opened"
    if action == "dca":
        return "dca added"
    if action == "partial_exit":
        return "partial exit"
    if action == "full_exit":
        return "position closed"
    label, _ = _win_loss(fill)
    return label


def timeline_events_from_fills(fills: list[FillEvent]) -> dict[str, TimelineEvent]:
    """Build timeline events enriched with position-aware trade metadata.

    The bot is currently long-only. Buys increase/open long size; sells reduce
    it. Existing recorded PnL is preserved rather than recomputed.
    """
    pos = 0.0
    avg_entry = 0.0
    out: dict[str, TimelineEvent] = {}

    for fill in sorted(fills, key=lambda f: (f.ts, f.event_id)):
        before = pos
        avg_before = avg_entry

        if fill.side == "buy":
            action: TradeAction = "dca" if before > EPS else "entry"
            after = before + fill.qty
            avg_after = ((before * avg_before) + (fill.qty * fill.price)) / after if after > EPS else 0.0
            pos = after
            avg_entry = avg_after
        else:
            if before <= EPS:
                action = "exit_unknown"
                after = 0.0
                avg_after = 0.0
            else:
                close_qty = min(fill.qty, before)
                after = max(0.0, before - close_qty)
                if after <= EPS:
                    action = "full_exit"
                    after = 0.0
                    avg_after = 0.0
                else:
                    action = "partial_exit"
                    avg_after = avg_before
                pos = after
                avg_entry = avg_after

        _, win_loss = _win_loss(fill)
        base_asset, quote_asset = parse_symbol_units(fill.symbol)
        payload = {
            "raw_id": fill.raw_id,
            "symbol": fill.symbol,
            "trade_action": action,
            "base_asset": base_asset,
            "quote_asset": quote_asset,
            "position_size_before": round(before, 8),
            "position_size_after": round(after, 8),
            "avg_entry_before": avg_before,
            "avg_entry_after": avg_after,
        }
        out[fill.event_id] = TimelineEvent(
            event_id=fill.event_id,
            ts=fill.ts,
            category="trade",
            label=_label_for_action(action, fill),
            side=fill.side,
            price=fill.price,
            qty=fill.qty,
            pnl=fill.pnl,
            win_loss=win_loss,  # type: ignore[arg-type]
            payload=payload,
        )

    return out


def fill_to_timeline(fill: FillEvent) -> TimelineEvent:
    """Compatibility helper for callers that only have one fill."""
    return timeline_events_from_fills([fill])[fill.event_id]
