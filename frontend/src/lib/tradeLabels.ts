import type { TimelineEvent, TradeAction } from "./types";

type TradeLike = Pick<TimelineEvent, "category" | "label" | "side" | "qty" | "price" | "pnl" | "payload">;

const TRADE_ACTIONS: TradeAction[] = ["entry", "dca", "partial_exit", "full_exit", "exit_unknown"];

function isTradeAction(value: unknown): value is TradeAction {
  return typeof value === "string" && TRADE_ACTIONS.includes(value as TradeAction);
}

function payloadString(ev: TradeLike, key: "base_asset" | "quote_asset" | "symbol"): string | null {
  const value = ev.payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function symbolUnits(symbol: string | null): { base: string; quote: string } {
  if (!symbol || !symbol.includes("/")) return { base: "HYPE", quote: "USDC" };
  const [left, right] = symbol.split("/", 2);
  const quotePart = right.includes(":") ? right.split(":", 2)[1] : right;
  return {
    base: left.trim() || "HYPE",
    quote: quotePart.split("-", 1)[0].trim() || "USDC",
  };
}

export function tradeAction(ev: TradeLike): TradeAction | null {
  if (ev.category !== "trade") return null;
  const action = ev.payload?.trade_action;
  if (isTradeAction(action)) return action;
  if (ev.side === "buy") return "entry";
  if (ev.side === "sell") return "exit_unknown";
  return null;
}

export function tradeUnits(ev: TradeLike): { base: string; quote: string } {
  const parsed = symbolUnits(payloadString(ev, "symbol"));
  return {
    base: payloadString(ev, "base_asset") ?? parsed.base,
    quote: payloadString(ev, "quote_asset") ?? parsed.quote,
  };
}

function formatNumber(value: number, maxDigits: number, minDigits = 0): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  });
}

function formatUnit(value: number | null | undefined, unit: string, maxDigits: number, minDigits = 0): string | null {
  if (value == null || !isFinite(value)) return null;
  return `${formatNumber(value, maxDigits, minDigits)} ${unit}`;
}

function formatSignedUnit(value: number | null | undefined, unit: string, maxDigits: number, minDigits = 0): string | null {
  if (value == null || !isFinite(value)) return null;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(value), maxDigits, minDigits)} ${unit}`;
}

export function formatTradeQty(ev: TradeLike, signed = false): string | null {
  const { base } = tradeUnits(ev);
  return signed ? formatSignedUnit(ev.qty, base, 4) : formatUnit(ev.qty, base, 4);
}

export function formatTradePrice(ev: TradeLike): string | null {
  const { quote } = tradeUnits(ev);
  return formatUnit(ev.price, quote, 4, 4);
}

export function formatTradePnl(ev: TradeLike): string | null {
  const { quote } = tradeUnits(ev);
  return formatSignedUnit(ev.pnl, quote, 2, 2);
}

export function formatSignedQuoteAmount(value: number | null | undefined, quote = "USDC"): string | null {
  return formatSignedUnit(value, quote, 2, 2);
}

export function tradeFeedTitle(ev: TradeLike): string {
  switch (tradeAction(ev)) {
    case "entry":
      return "Entry opened";
    case "dca":
      return "DCA added";
    case "partial_exit":
      return "Partial exit";
    case "full_exit":
      return "Position closed";
    case "exit_unknown":
      return "Exit";
    default:
      return ev.label;
  }
}

export function tradeMarkerText(ev: TradeLike): string {
  return tradeMarkerLines(ev).join(" / ");
}

export function tradeMarkerLines(ev: TradeLike): string[] {
  const action = tradeAction(ev);
  const qty = formatTradeQty(ev);
  const signedQty = formatTradeQty(ev, true);
  const pnl = formatTradePnl(ev);

  switch (action) {
    case "entry":
      return [qty ? `ENTRY ${qty}` : "ENTRY"];
    case "dca":
      return [signedQty ? `DCA ${signedQty}` : "DCA"];
    case "partial_exit":
      return [qty ? `PART EXIT ${qty}` : "PART EXIT", pnl].filter((line): line is string => Boolean(line));
    case "full_exit":
      return [qty ? `CLOSED ${qty}` : "CLOSED", pnl].filter((line): line is string => Boolean(line));
    case "exit_unknown":
      return [qty ? `EXIT ${qty}` : "EXIT", pnl].filter((line): line is string => Boolean(line));
    default:
      return [ev.label];
  }
}
