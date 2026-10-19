import { quoteToAccount } from "./instruments";
import type { InstrumentSpec, RiskMode, Side } from "./types";

export const LOT_STEP = 0.01;
export const MIN_LOT = 0.01;
export const MAX_LOT = 100;

/** Round lots DOWN to the lot step so the realised risk never exceeds the target. */
export function floorLots(lots: number, step = LOT_STEP): number {
  if (!Number.isFinite(lots) || lots <= 0) return 0;
  const units = Math.floor(lots / step + 1e-9);
  return Math.round(units * step * 100) / 100;
}

export function roundLots(lots: number, step = LOT_STEP): number {
  if (!Number.isFinite(lots) || lots <= 0) return 0;
  return Math.round(Math.round(lots / step) * step * 100) / 100;
}

/**
 * Account-currency value of a price move of `distance` on `lots`, converting
 * the quote currency at `priceAtExit` (relevant when the base currency is the
 * account currency, e.g. USDJPY on a USD account).
 */
export function moneyForMove(
  distance: number,
  lots: number,
  spec: InstrumentSpec,
  accountCurrency: string,
  priceAtExit: number,
  conversionRate: number | null,
): number {
  const conv = quoteToAccount(spec, accountCurrency, priceAtExit, conversionRate);
  return distance * lots * spec.contractSize * conv.rate;
}

/** Monetary loss for 1.00 lot if a trade entered at `entry` exits at `stop`. */
export function lossPerLot(
  entry: number,
  stop: number,
  spec: InstrumentSpec,
  accountCurrency: string,
  conversionRate: number | null,
): number {
  return moneyForMove(Math.abs(entry - stop), 1, spec, accountCurrency, stop, conversionRate);
}

export interface SizingInput {
  mode: RiskMode;
  side: Side;
  equity: number;
  riskPercent: number;
  riskMoney: number;
  fixedLots: number;
  entry: number;
  sl: number | null;
  tp: number | null;
  spec: InstrumentSpec;
  accountCurrency: string;
  conversionRate: number | null;
}

export interface SizingResult {
  lots: number;
  /** Monetary loss at the stop for the computed lots (excludes commission). */
  riskMoney: number | null;
  riskPercent: number | null;
  rewardMoney: number | null;
  rr: number | null;
  slPips: number | null;
  tpPips: number | null;
  lossPerLot: number | null;
  exactConversion: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Position size = monetary risk ÷ monetary loss per lot at the stop-loss.
 * Uses the instrument's own contract size and conversion — no generic pip value.
 */
export function computeSizing(input: SizingInput): SizingResult {
  const { spec, entry, sl, tp, side } = input;
  const errors: string[] = [];
  const warnings: string[] = [];
  const conv = quoteToAccount(spec, input.accountCurrency, entry, input.conversionRate);
  const result: SizingResult = {
    lots: 0,
    riskMoney: null,
    riskPercent: null,
    rewardMoney: null,
    rr: null,
    slPips: null,
    tpPips: null,
    lossPerLot: null,
    exactConversion: conv.exact,
    errors,
    warnings,
  };
  if (conv.source === "missing") {
    errors.push(`Enter a ${spec.quote}→${input.accountCurrency} conversion rate in session settings to value this instrument.`);
    return result;
  }
  if (!conv.exact) warnings.push("Money values use your fixed conversion rate — approximate.");
  if (!Number.isFinite(entry) || entry <= 0) {
    errors.push("Entry price is not available.");
    return result;
  }
  if (sl !== null) {
    const wrongSide = side === "buy" ? sl >= entry : sl <= entry;
    if (wrongSide) errors.push(side === "buy" ? "Stop-loss must be below the entry for a buy." : "Stop-loss must be above the entry for a sell.");
    else {
      result.slPips = Math.abs(entry - sl) / spec.pipSize;
      result.lossPerLot = lossPerLot(entry, sl, spec, input.accountCurrency, input.conversionRate);
    }
  }
  if (tp !== null) {
    const wrongSide = side === "buy" ? tp <= entry : tp >= entry;
    if (wrongSide) errors.push(side === "buy" ? "Take-profit must be above the entry for a buy." : "Take-profit must be below the entry for a sell.");
    else result.tpPips = Math.abs(tp - entry) / spec.pipSize;
  }

  if (input.mode === "lots") {
    result.lots = floorLots(input.fixedLots);
  } else {
    if (sl === null) {
      errors.push("Risk-based sizing needs a stop-loss.");
      return result;
    }
    if (result.lossPerLot === null || result.lossPerLot <= 0) return result;
    const target = input.mode === "percent" ? (input.equity * input.riskPercent) / 100 : input.riskMoney;
    if (!(target > 0)) {
      errors.push("Risk amount must be greater than zero.");
      return result;
    }
    const raw = target / result.lossPerLot;
    result.lots = floorLots(raw);
    if (result.lots < MIN_LOT) {
      errors.push(`Risk is too small for the minimum ${MIN_LOT.toFixed(2)} lot (it would risk ${(result.lossPerLot * MIN_LOT).toFixed(2)} ${input.accountCurrency}).`);
      result.lots = 0;
    }
  }
  if (result.lots > MAX_LOT) {
    warnings.push(`Capped at ${MAX_LOT} lots.`);
    result.lots = MAX_LOT;
  }
  if (input.mode === "lots" && result.lots < MIN_LOT) errors.push(`Minimum size is ${MIN_LOT.toFixed(2)} lot.`);

  if (result.lossPerLot !== null && result.lots > 0) {
    result.riskMoney = result.lossPerLot * result.lots;
    result.riskPercent = input.equity > 0 ? (result.riskMoney / input.equity) * 100 : null;
  }
  if (tp !== null && result.tpPips !== null && result.lots > 0) {
    result.rewardMoney = moneyForMove(Math.abs(tp - entry), result.lots, spec, input.accountCurrency, tp, input.conversionRate);
  }
  if (result.slPips !== null && result.tpPips !== null && result.slPips > 0) {
    result.rr = result.tpPips / result.slPips;
  }
  return result;
}
