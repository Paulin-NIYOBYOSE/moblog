import type { ControllerSnapshot } from "@/lib/replay/controller";
import { validatePendingPrice } from "@/lib/replay/engine";
import { computeSizing, type SizingResult } from "@/lib/replay/sizing";
import type { PendingType, Side } from "@/lib/replay/types";
import { parsePositive, parsePrice } from "../format";

export type LevelMode = "pips" | "price";

export interface TicketState {
  side: Side;
  orderType: "market" | "limit" | "stop";
  entry: string;
  slMode: LevelMode;
  sl: string;
  tpMode: LevelMode;
  tp: string;
  note: string;
}

/** Money base that %-risk sizing uses: the starting or the current balance. */
export function riskBase(snap: Pick<ControllerSnapshot, "session" | "balance">): number {
  return snap.session.settings.riskBase === "initial" ? snap.session.settings.initialBalance : snap.balance;
}

export function initialTicket(): TicketState {
  return { side: "buy", orderType: "market", entry: "", slMode: "pips", sl: "20", tpMode: "pips", tp: "40", note: "" };
}

export interface DerivedTicket {
  /** Expected fill (market) or order price (pending). */
  entry: number | null;
  pendingType: PendingType | null;
  sl: number | null;
  tp: number | null;
  sizing: SizingResult;
  errors: string[];
}

export function pendingTypeOf(side: Side, orderType: TicketState["orderType"]): PendingType | null {
  if (orderType === "market") return null;
  return `${side}-${orderType}` as PendingType;
}

export function deriveTicket(t: TicketState, snap: ControllerSnapshot): DerivedTicket {
  const { spec, quote, session } = snap;
  const s = session.settings;
  const slip = Math.max(0, s.slippagePips) * spec.pipSize;
  const pendingType = pendingTypeOf(t.side, t.orderType);
  const round = (p: number) => +p.toFixed(spec.digits);
  const entry = pendingType ? parsePrice(t.entry) : round(t.side === "buy" ? quote.ask + slip : quote.bid - slip);
  const dir = t.side === "buy" ? 1 : -1;
  const level = (mode: LevelMode, raw: string, sign: 1 | -1): number | null => {
    if (!raw.trim()) return null;
    if (mode === "price") return parsePrice(raw);
    const pips = parsePositive(raw);
    if (pips === null || pips === 0 || entry === null) return null;
    return round(entry + sign * dir * pips * spec.pipSize);
  };
  const sl = level(t.slMode, t.sl, -1);
  const tp = level(t.tpMode, t.tp, 1);
  const errors: string[] = [];
  if (pendingType) {
    if (entry === null) errors.push("Enter the order price.");
    else {
      const e = validatePendingPrice(pendingType, entry, quote);
      if (e) errors.push(e);
    }
  }
  if (t.sl.trim() && sl === null) errors.push("Stop-loss value is not a valid number.");
  if (t.tp.trim() && tp === null) errors.push("Take-profit value is not a valid number.");
  const sizing = computeSizing({
    mode: s.riskMode,
    side: t.side,
    equity: riskBase(snap),
    riskPercent: s.riskPercent,
    riskMoney: s.riskMoney,
    fixedLots: s.fixedLots,
    entry: entry ?? NaN,
    sl,
    tp,
    spec,
    accountCurrency: s.accountCurrency,
    conversionRate: s.conversionRate,
  });
  return { entry, pendingType, sl, tp, sizing, errors: [...errors, ...sizing.errors] };
}

/** Write a price picked or dragged on the chart back into the ticket. */
export function applyPrice(t: TicketState, field: "entry" | "sl" | "tp", price: number, derived: DerivedTicket, pipSize: number, digits: number): TicketState {
  if (field === "entry") return { ...t, entry: price.toFixed(digits), orderType: t.orderType === "market" ? "limit" : t.orderType };
  const mode = field === "sl" ? t.slMode : t.tpMode;
  let value: string;
  if (mode === "price" || derived.entry === null) value = price.toFixed(digits);
  else value = (Math.abs(derived.entry - price) / pipSize).toFixed(1);
  if (field === "sl") return { ...t, sl: value, slMode: derived.entry === null ? "price" : t.slMode };
  return { ...t, tp: value, tpMode: derived.entry === null ? "price" : t.tpMode };
}
