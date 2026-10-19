import { quoteToAccount } from "./instruments";
import type { InstrumentSpec, Side } from "./types";

// Figures shown on position boxes and trade pills (TradingView / FX Replay
// style): distance in pips, price move in %, money and % of the account.

export interface LevelStats {
  /** Distance from entry in pips (always positive). */
  pips: number;
  /** Price move as a % of the entry price (always positive). */
  pricePct: number;
  /** Signed money result if price reaches the level, in account currency. */
  money: number;
  /** `money` as a % of the account balance (signed). */
  accountPct: number | null;
}

export function levelStats(a: {
  side: Side;
  entry: number;
  level: number;
  lots: number;
  spec: InstrumentSpec;
  accountCurrency: string;
  conversionRate: number | null;
  balance: number;
}): LevelStats {
  const dir = a.side === "buy" ? 1 : -1;
  const distance = Math.abs(a.level - a.entry);
  const signed = (a.level - a.entry) * dir;
  const conv = quoteToAccount(a.spec, a.accountCurrency, a.level, a.conversionRate);
  const money = signed * a.lots * a.spec.contractSize * conv.rate;
  return {
    pips: distance / a.spec.pipSize,
    pricePct: a.entry > 0 ? (distance / a.entry) * 100 : 0,
    money,
    accountPct: a.balance > 0 && Number.isFinite(money) ? (money / a.balance) * 100 : null,
  };
}

/** Reward ÷ risk by price distance, or null when either side is missing. */
export function rewardRisk(entry: number, sl: number | null, tp: number | null): number | null {
  if (sl === null || tp === null) return null;
  const risk = Math.abs(entry - sl);
  return risk > 0 ? Math.abs(tp - entry) / risk : null;
}

export function signedMoney(v: number, currency: string): string {
  if (!Number.isFinite(v)) return "—";
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v));
  return v > 0.004 ? `+${s}` : v < -0.004 ? `−${s}` : s;
}

export function signedPct(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v > 0.00049 ? "+" : v < -0.00049 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;
}

/** "Target: 1.10500 (0.45%) 50.0 pips · Amount: +$450.00 (+4.50%)" */
export function levelLabel(kind: "Target" | "Stop", price: number, s: LevelStats, digits: number, currency: string): string {
  return `${kind}: ${price.toFixed(digits)} (${s.pricePct.toFixed(2)}%) ${s.pips.toFixed(1)} pips · Amount: ${signedMoney(s.money, currency)} (${signedPct(s.accountPct)})`;
}
