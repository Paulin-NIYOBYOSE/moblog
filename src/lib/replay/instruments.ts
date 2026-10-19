import type { InstrumentSpec } from "./types";

// Contract specs follow the common retail-broker convention. Money values in
// the engine are computed from price distance × units, so the pip size only
// affects how distances are displayed — never the P&L itself.

const FX_STANDARD = 100_000;

function fx(symbol: string, description: string): InstrumentSpec {
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3, 6);
  const jpy = quote === "JPY";
  return {
    symbol,
    base,
    quote,
    pipSize: jpy ? 0.01 : 0.0001,
    digits: jpy ? 3 : 5,
    contractSize: FX_STANDARD,
    kind: "fx",
    description,
  };
}

export const INSTRUMENTS: InstrumentSpec[] = [
  fx("EURUSD", "Euro / US Dollar"),
  fx("GBPUSD", "British Pound / US Dollar"),
  fx("USDJPY", "US Dollar / Japanese Yen"),
  fx("USDCHF", "US Dollar / Swiss Franc"),
  fx("USDCAD", "US Dollar / Canadian Dollar"),
  fx("AUDUSD", "Australian Dollar / US Dollar"),
  fx("NZDUSD", "New Zealand Dollar / US Dollar"),
  fx("EURJPY", "Euro / Japanese Yen"),
  fx("GBPJPY", "British Pound / Japanese Yen"),
  fx("EURGBP", "Euro / British Pound"),
  {
    symbol: "XAUUSD",
    base: "XAU",
    quote: "USD",
    pipSize: 0.1,
    digits: 2,
    contractSize: 100,
    kind: "metal",
    description: "Gold / US Dollar (100 oz per lot)",
  },
  {
    symbol: "XAGUSD",
    base: "XAG",
    quote: "USD",
    pipSize: 0.01,
    digits: 3,
    contractSize: 5000,
    kind: "metal",
    description: "Silver / US Dollar (5,000 oz per lot)",
  },
  fx("AUDJPY", "Australian Dollar / Japanese Yen"),
  fx("CADJPY", "Canadian Dollar / Japanese Yen"),
  fx("CHFJPY", "Swiss Franc / Japanese Yen"),
  fx("NZDJPY", "New Zealand Dollar / Japanese Yen"),
  fx("EURCHF", "Euro / Swiss Franc"),
  fx("EURAUD", "Euro / Australian Dollar"),
  fx("EURCAD", "Euro / Canadian Dollar"),
  fx("EURNZD", "Euro / New Zealand Dollar"),
  fx("GBPCHF", "British Pound / Swiss Franc"),
  fx("GBPAUD", "British Pound / Australian Dollar"),
  fx("GBPCAD", "British Pound / Canadian Dollar"),
  fx("GBPNZD", "British Pound / New Zealand Dollar"),
  fx("AUDCAD", "Australian Dollar / Canadian Dollar"),
  fx("AUDCHF", "Australian Dollar / Swiss Franc"),
  fx("AUDNZD", "Australian Dollar / New Zealand Dollar"),
  fx("CADCHF", "Canadian Dollar / Swiss Franc"),
  fx("NZDCAD", "New Zealand Dollar / Canadian Dollar"),
  fx("NZDCHF", "New Zealand Dollar / Swiss Franc"),
];

/** The pairs Replay is primarily built and tested around. */
export const PRIMARY_SYMBOLS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "USDCAD",
  "AUDUSD",
  "NZDUSD",
  "EURJPY",
  "GBPJPY",
  "EURGBP",
  "XAUUSD",
];

const CURRENCY_CODES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN",
  "HUF", "CZK", "TRY", "ZAR", "MXN", "SGD", "HKD", "CNH", "XAU", "XAG",
]);

/** Typical retail spreads in pips — defaults only, always user-editable. */
export const DEFAULT_SPREAD_PIPS: Record<string, number> = {
  EURUSD: 1.0,
  GBPUSD: 1.4,
  USDJPY: 1.2,
  USDCHF: 1.6,
  USDCAD: 1.8,
  AUDUSD: 1.2,
  NZDUSD: 1.8,
  EURJPY: 1.8,
  GBPJPY: 2.8,
  EURGBP: 1.4,
  XAUUSD: 3.0,
  XAGUSD: 3.0,
};

export function normalizeSymbol(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * Resolve an instrument spec. Known symbols come from the table; any other
 * six-letter pair made of ISO currency codes gets standard FX specs, so new
 * pairs work without touching the engine.
 */
export function resolveInstrument(symbol: string): InstrumentSpec | null {
  const s = normalizeSymbol(symbol);
  const known = INSTRUMENTS.find((i) => i.symbol === s);
  if (known) return known;
  if (s.length === 6 && CURRENCY_CODES.has(s.slice(0, 3)) && CURRENCY_CODES.has(s.slice(3))) {
    return { ...fx(s, `${s.slice(0, 3)} / ${s.slice(3)}`), kind: "custom" };
  }
  return null;
}

/** Find a known symbol inside a file name such as DAT_ASCII_EURUSD_M1_2024.csv. */
export function symbolFromText(text: string): string | null {
  const upper = text.toUpperCase();
  const compact = upper.replace(/[^A-Z]/g, "");
  for (const inst of INSTRUMENTS) {
    if (upper.includes(inst.symbol)) return inst.symbol;
  }
  // EUR_USD / EUR-USD / EUR/USD
  const m = upper.match(/([A-Z]{3})[_\-/ ]([A-Z]{3})/);
  if (m && CURRENCY_CODES.has(m[1]) && CURRENCY_CODES.has(m[2])) return m[1] + m[2];
  for (let i = 0; i + 6 <= compact.length; i++) {
    const cand = compact.slice(i, i + 6);
    if (CURRENCY_CODES.has(cand.slice(0, 3)) && CURRENCY_CODES.has(cand.slice(3))) return cand;
  }
  return null;
}

export interface ConversionInfo {
  /** Multiply a quote-currency amount by this to get account currency. */
  rate: number;
  exact: boolean;
  source: "identity" | "instrument" | "fixed" | "missing";
}

/**
 * How quote-currency money converts into the account currency at a given
 * instrument price:
 *  - quote is the account currency  → 1 (EURUSD on a USD account)
 *  - base is the account currency   → 1 / price (USDJPY on a USD account)
 *  - otherwise a user-supplied fixed rate, clearly marked approximate.
 */
export function quoteToAccount(
  spec: InstrumentSpec,
  accountCurrency: string,
  price: number,
  fixedRate: number | null,
): ConversionInfo {
  if (spec.quote === accountCurrency) return { rate: 1, exact: true, source: "identity" };
  if (spec.base === accountCurrency && price > 0) return { rate: 1 / price, exact: true, source: "instrument" };
  if (fixedRate !== null && fixedRate > 0 && Number.isFinite(fixedRate)) {
    return { rate: fixedRate, exact: false, source: "fixed" };
  }
  return { rate: NaN, exact: false, source: "missing" };
}

/** True when money conversion needs a user-entered rate. */
export function needsConversionRate(spec: Pick<InstrumentSpec, "base" | "quote">, accountCurrency: string): boolean {
  return spec.quote !== accountCurrency && spec.base !== accountCurrency;
}

/**
 * The pair a trader would quote to describe the conversion (e.g. USDJPY for a
 * JPY-quoted cross on a USD account) and whether its price must be inverted to
 * get "1 quote = X account".
 */
export function conversionPair(spec: Pick<InstrumentSpec, "quote">, accountCurrency: string): { pair: string; invert: boolean } {
  const direct = `${spec.quote}${accountCurrency}`;
  const inverse = `${accountCurrency}${spec.quote}`;
  if (INSTRUMENTS.some((i) => i.symbol === inverse)) return { pair: inverse, invert: true };
  if (INSTRUMENTS.some((i) => i.symbol === direct)) return { pair: direct, invert: false };
  return { pair: direct, invert: false };
}

export function formatPrice(price: number, spec: Pick<InstrumentSpec, "digits">): string {
  if (!Number.isFinite(price)) return "—";
  return price.toFixed(spec.digits);
}

export function priceToPips(distance: number, spec: Pick<InstrumentSpec, "pipSize">): number {
  return distance / spec.pipSize;
}
