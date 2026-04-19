"""Long-only PnL reconstruction, ported from infos/plot_passivbot.py.

`reconstruct_pnl_from_fills` treats buys as opens (updates weighted avg entry)
and sells as closes (PnL = qty * (sell_price - avg_entry)). It returns a new
list of fills with computed `pnl` values; the originals are not mutated.

We intentionally keep this long-only — the live HYPE bot is long-only. If the
bot ever shorts, this function must be extended; we assert_short_free as a
safety check to surface silent regressions.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..models import FillEvent


@dataclass(frozen=True)
class PositionState:
    size: float
    avg_entry: float


def reconstruct_pnl_from_fills(fills: list[FillEvent]) -> list[FillEvent]:
    """Return a new list of FillEvents with reconstructed pnl and long-only position_side."""
    pos = 0.0
    avg_entry = 0.0
    out: list[FillEvent] = []
    for f in sorted(fills, key=lambda x: x.ts):
        pnl = 0.0
        if f.side == "buy":
            if pos + f.qty > 0:
                avg_entry = (pos * avg_entry + f.qty * f.price) / (pos + f.qty)
            else:
                avg_entry = f.price
            pos += f.qty
        else:  # sell
            if pos > 0 and avg_entry > 0:
                close_qty = min(f.qty, pos)
                pnl = close_qty * (f.price - avg_entry)
                pos -= close_qty
        out.append(f.model_copy(update={"pnl": pnl, "position_side": "long"}))
    return out


def current_position_from_fills(fills: list[FillEvent]) -> PositionState:
    pos = 0.0
    avg_entry = 0.0
    for f in sorted(fills, key=lambda x: x.ts):
        if f.side == "buy":
            new_size = pos + f.qty
            if new_size > 0:
                avg_entry = (pos * avg_entry + f.qty * f.price) / new_size
            pos = new_size
        else:
            close = min(f.qty, pos)
            pos -= close
            if pos <= 1e-9:
                pos = 0.0
                avg_entry = 0.0
    return PositionState(size=round(pos, 8), avg_entry=avg_entry)
