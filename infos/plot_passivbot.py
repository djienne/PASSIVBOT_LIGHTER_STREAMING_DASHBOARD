#!/usr/bin/env python3
"""Download and plot PnL data from remote passivbot instance."""

import json
import subprocess
import sys
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────
REFERENCE_CAPITAL = 600.0  # Starting capital for % return calculations

REMOTE_HOST = "54.95.246.213"
REMOTE_USER = "ubuntu"
KEY_FILE = Path(__file__).parent / "lighter.pem"
REMOTE_DIRS = ["/home/ubuntu/passivbot_lighter", "/home/ubuntu/passivbot"]
LOCAL_JSON = Path(__file__).parent / "passivbot_pnls.json"
SSH_OPTS = ["-i", str(KEY_FILE), "-o", "StrictHostKeyChecking=no"]


def ssh_command(cmd_str: str) -> subprocess.CompletedProcess:
    """Run a command on the remote server via SSH."""
    return subprocess.run(
        ["ssh"] + SSH_OPTS + [f"{REMOTE_USER}@{REMOTE_HOST}", cmd_str],
        capture_output=True,
        text=True,
    )


def discover_pnl_files() -> tuple[str | None, list[str]]:
    """SSH to remote and find *_pnls.json files."""
    if not KEY_FILE.exists():
        print(f"Error: Key file not found: {KEY_FILE}")
        return None, []

    for remote_dir in REMOTE_DIRS:
        print(f"Searching {remote_dir}/caches/ ...")
        result = ssh_command(
            f"find {remote_dir}/caches -name '*_pnls.json' -type f 2>/dev/null"
        )
        if result.returncode == 0 and result.stdout.strip():
            files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
            if files:
                return remote_dir, files

    return None, []


def download_pnl_file(remote_path: str) -> bool:
    """Download a PnL JSON file from remote server via SCP."""
    remote = f"{REMOTE_USER}@{REMOTE_HOST}:{remote_path}"
    scp_opts = ["-i", str(KEY_FILE), "-o", "StrictHostKeyChecking=no"]

    print(f"Downloading {remote_path} ...")
    result = subprocess.run(
        ["scp"] + scp_opts + [remote, str(LOCAL_JSON)],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"Download failed: {result.stderr}")
        return False

    print(f"Downloaded to {LOCAL_JSON}")
    return True


def reconstruct_pnl(df):
    """Compute PnL from trade data for a long-only strategy.

    Used when the exchange API doesn't provide realized PnL (e.g. Lighter).
    Buys = Open Long (increase position, update avg entry).
    Sells = Close Long (reduce position, PnL = qty * (sell_price - avg_entry)).

    Modifies df["pnl"] and df["position_side"] in place.
    """
    qty_col = "qty" if "qty" in df.columns else "amount"
    pos = 0.0
    avg_entry = 0.0
    pnls = []

    for _, row in df.iterrows():
        qty = row[qty_col]
        price = row["price"]
        computed_pnl = 0.0

        if row["side"] == "buy":
            # Open Long: update weighted avg entry
            if pos + qty > 0:
                avg_entry = (pos * avg_entry + qty * price) / (pos + qty)
            else:
                avg_entry = price
            pos += qty
        else:
            # Close Long: PnL = qty * (sell_price - avg_entry)
            if pos > 0 and avg_entry > 0:
                close_qty = min(qty, pos)
                computed_pnl = close_qty * (price - avg_entry)
                pos -= close_qty
            # else: sell without known position (incomplete history), PnL unknown

        pnls.append(computed_pnl)

    df["pnl"] = pnls
    df["position_side"] = "long"
    skipped = sum(1 for _, r in df.iterrows() if r["side"] == "sell") - sum(1 for p in pnls if p != 0 and pnls.index(p) is not None)
    print(f"Reconstructed PnL from {len(df)} trades (long-only, API did not provide realized PnL)")


def plot_data():
    """Parse PnL JSON and create plots."""
    try:
        import pandas as pd
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
    except ImportError:
        print("Installing required packages...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pandas", "matplotlib"])
        import pandas as pd
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates

    # Load JSON
    with open(LOCAL_JSON) as f:
        pnls = json.load(f)

    if not pnls:
        print("No PnL records found in file.")
        sys.exit(1)

    df = pd.DataFrame(pnls)
    # Detect timestamp unit: if max > 1e12, it's ms; otherwise seconds
    ts_unit = "ms" if df["timestamp"].max() > 1e12 else "s"
    df["datetime"] = pd.to_datetime(df["timestamp"], unit=ts_unit)
    df = df.sort_values("datetime").reset_index(drop=True)
    # Handle empty symbol field
    if df["symbol"].eq("").all() or df["symbol"].isna().all():
        df["symbol"] = "UNKNOWN"
    # Reconstruct PnL if all values are 0 (e.g. Lighter API bug)
    if df["pnl"].eq(0).all():
        reconstruct_pnl(df)
    # For long-only bots, position_side may be wrong (derived from trade direction)
    # Override: all trades belong to the long side
    if df["position_side"].eq("long").sum() > 0 and df["side"].eq("sell").any():
        sells_as_short = ((df["side"] == "sell") & (df["position_side"] == "short")).sum()
        if sells_as_short > 0:
            df["position_side"] = "long"
    df["cum_pnl"] = df["pnl"].cumsum()
    qty_col = "qty" if "qty" in df.columns else "amount"
    df["notional"] = df[qty_col] * df["price"]

    # Filter to only closing trades (pnl != 0) for some plots
    closes = df[df["pnl"] != 0].copy()

    # Create figure with subplots
    fig, axes = plt.subplots(3, 2, figsize=(14, 10))
    period_days = (df["datetime"].max() - df["datetime"].min()).total_seconds() / 86400
    total_pnl_title = df["pnl"].sum()
    pnl_pct_title = (total_pnl_title / REFERENCE_CAPITAL) * 100
    cagr = ((1 + total_pnl_title / REFERENCE_CAPITAL) ** (365 / period_days) - 1) * 100 if period_days > 0 else 0
    fig.suptitle(
        f"Passivbot Lighter - HYPE Long Only - PnL Analysis ({period_days:.1f} days)\n"
        f"PnL: {pnl_pct_title:+.2f}%  |  CAGR: {cagr:+.1f}%",
        fontsize=14, fontweight="bold",
    )

    # 1. Cumulative PnL over time
    ax = axes[0, 0]
    ax.plot(df["datetime"], df["cum_pnl"], "b-", linewidth=1)
    ax.axhline(y=0, color="gray", linestyle="--", alpha=0.5)
    ax.set_ylabel("Cumulative PnL ($)")
    ax.set_title("Cumulative PnL over Time")
    ax.grid(True, alpha=0.3)
    ax.fill_between(
        df["datetime"], df["cum_pnl"], 0,
        where=(df["cum_pnl"] >= 0), alpha=0.3, color="green",
    )
    ax.fill_between(
        df["datetime"], df["cum_pnl"], 0,
        where=(df["cum_pnl"] < 0), alpha=0.3, color="red",
    )
    # Secondary y-axis for % return on reference capital
    ax2 = ax.twinx()
    cum_pnl_pct = (df["cum_pnl"] / REFERENCE_CAPITAL) * 100
    ax2.plot(df["datetime"], cum_pnl_pct, color="orange", linestyle="--", linewidth=0.8, alpha=0.7)
    ax2.set_ylabel(f"Return on ${REFERENCE_CAPITAL:.0f} (%)", color="orange")
    ax2.tick_params(axis="y", labelcolor="orange")

    # 2. Individual trade PnLs (scatter, closes only)
    ax = axes[0, 1]
    if len(closes) > 0:
        colors = ["green" if p > 0 else "red" for p in closes["pnl"]]
        ax.scatter(closes["datetime"], closes["pnl"], c=colors, s=10, alpha=0.6)
        ax.axhline(y=0, color="gray", linestyle="--", alpha=0.5)
    ax.set_ylabel("PnL ($)")
    ax.set_title("Individual Trade PnLs")
    ax.grid(True, alpha=0.3)

    # 3. Cumulative PnL by position side
    ax = axes[1, 0]
    for side, color, label in [("long", "green", "Long"), ("short", "red", "Short")]:
        mask = df["position_side"] == side
        if mask.any():
            side_cum = df.loc[mask, "pnl"].cumsum()
            ax.plot(df.loc[mask, "datetime"], side_cum, color=color, linewidth=1, label=label)
    ax.axhline(y=0, color="gray", linestyle="--", alpha=0.5)
    ax.set_ylabel("Cumulative PnL ($)")
    ax.set_title("PnL by Position Side")
    ax.legend()
    ax.grid(True, alpha=0.3)

    # 4. Trade notional over time
    ax = axes[1, 1]
    buy_mask = df["side"] == "buy"
    sell_mask = df["side"] == "sell"
    if buy_mask.any():
        ax.scatter(df.loc[buy_mask, "datetime"], df.loc[buy_mask, "notional"],
                   c="green", s=8, alpha=0.4, label="Buy")
    if sell_mask.any():
        ax.scatter(df.loc[sell_mask, "datetime"], df.loc[sell_mask, "notional"],
                   c="red", s=8, alpha=0.4, label="Sell")
    ax.set_ylabel("Notional ($)")
    ax.set_title("Trade Size over Time")
    ax.legend()
    ax.grid(True, alpha=0.3)

    # 5. PnL per symbol or histogram
    ax = axes[2, 0]
    symbols = df["symbol"].unique()
    if len(symbols) > 1:
        for sym in symbols:
            sym_df = df[df["symbol"] == sym]
            ax.plot(sym_df["datetime"], sym_df["pnl"].cumsum(), linewidth=1, label=sym)
        ax.set_ylabel("Cumulative PnL ($)")
        ax.set_title("PnL by Symbol")
        ax.legend(fontsize=7)
    else:
        if len(closes) > 0:
            ax.hist(closes["pnl"], bins=50, color="steelblue", edgecolor="white", alpha=0.8)
        ax.set_xlabel("PnL ($)")
        ax.set_ylabel("Count")
        ax.set_title(f"PnL Distribution ({symbols[0]})")
    ax.grid(True, alpha=0.3)

    # 6. Drawdown ($ and % from peak equity)
    ax = axes[2, 1]
    running_max = df["cum_pnl"].cummax()
    drawdown = df["cum_pnl"] - running_max
    peak_equity = REFERENCE_CAPITAL + running_max
    drawdown_pct = (drawdown / peak_equity) * 100
    ax.fill_between(df["datetime"], drawdown, 0, color="red", alpha=0.4)
    ax.plot(df["datetime"], drawdown, "r-", linewidth=0.8)
    ax.set_ylabel("Drawdown ($)")
    ax.set_title("Drawdown from Peak")
    ax.grid(True, alpha=0.3)
    ax2 = ax.twinx()
    ax2.plot(df["datetime"], drawdown_pct, color="orange", linestyle="--", linewidth=0.8, alpha=0.7)
    ax2.set_ylabel("Drawdown (%)", color="orange")
    ax2.tick_params(axis="y", labelcolor="orange")

    # Format x-axis for all subplots
    for ax in axes.flat:
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d %H:%M"))
        ax.tick_params(axis="x", rotation=30)

    plt.tight_layout()

    # Print summary stats
    print("\n" + "=" * 50)
    print("PASSIVBOT PnL SUMMARY")
    print("=" * 50)
    print(f"Time range: {df['datetime'].min()} to {df['datetime'].max()}")
    print(f"Total fills: {len(df)}")
    print(f"Closing trades (PnL != 0): {len(closes)}")

    total_pnl = df["pnl"].sum()
    long_pnl = df.loc[df["position_side"] == "long", "pnl"].sum()
    short_pnl = df.loc[df["position_side"] == "short", "pnl"].sum()
    pnl_pct = (total_pnl / REFERENCE_CAPITAL) * 100
    print(f"\nCumulative PnL: ${total_pnl:.4f} ({pnl_pct:.2f}% on ${REFERENCE_CAPITAL:.0f})")
    print(f"  Long PnL:     ${long_pnl:.4f}")
    print(f"  Short PnL:    ${short_pnl:.4f}")

    if len(closes) > 0:
        wins = closes[closes["pnl"] > 0]
        losses = closes[closes["pnl"] < 0]
        win_rate = len(wins) / len(closes) * 100 if len(closes) > 0 else 0
        print(f"\nWin rate: {win_rate:.1f}% ({len(wins)} wins / {len(closes)} closes)")
        if len(wins) > 0:
            print(f"Avg win:      ${wins['pnl'].mean():.4f}")
            print(f"Largest win:  ${wins['pnl'].max():.4f}")
        if len(losses) > 0:
            print(f"Avg loss:     ${losses['pnl'].mean():.4f}")
            print(f"Largest loss: ${losses['pnl'].min():.4f}")

    max_dd = drawdown.min()
    max_dd_pct = drawdown_pct.min()
    print(f"\nMax drawdown: ${max_dd:.4f} ({max_dd_pct:.2f}% from peak)")

    print(f"\nSymbols traded: {', '.join(symbols)}")
    if len(symbols) > 1:
        print("PnL by symbol:")
        for sym in symbols:
            sym_pnl = df.loc[df["symbol"] == sym, "pnl"].sum()
            print(f"  {sym}: ${sym_pnl:.4f}")

    print("=" * 50)

    plt.show()


def main():
    # Phase 1: Discover and download
    remote_dir, pnl_files = discover_pnl_files()
    if not pnl_files:
        print("No PnL files found on remote server.")
        if LOCAL_JSON.exists():
            print("Using existing local file...")
        else:
            sys.exit(1)
    else:
        print(f"Found {len(pnl_files)} PnL file(s):")
        for f in pnl_files:
            print(f"  {f}")
        if not download_pnl_file(pnl_files[0]):
            if LOCAL_JSON.exists():
                print("Using existing local file...")
            else:
                sys.exit(1)

    # Phase 2: Plot
    plot_data()


if __name__ == "__main__":
    main()
