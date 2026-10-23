import { TF_SECONDS } from "../time";
import type { ProviderCoverage, ProviderId, Timeframe } from "../types";
import { EXNESS } from "./exness";
import { FXCM, weekSundayOf } from "./fxcm";

// Automatic history comes from free archives, asked in this order for every
// trading week until one has the complete week:
//   1. FXCM's weekly candle files — about 100 KB a week, fast.
//   2. Candles built from Exness's tick history — fills the weeks FXCM is
//      missing, has broken or hasn't published yet (a 5–13 MB month file).
// A week's candles always come from a single provider, so each week is
// internally consistent; the weekend closure separates weeks of different
// providers.

export const PROVIDERS = { fxcm: FXCM, exness: EXNESS } satisfies Record<ProviderId, { name: string; short: string; homepage: string; terms: string; firstYear: number }>;

const ORDER: ProviderId[] = ["fxcm", "exness"];

/** Providers that carry `symbol` at `resolution`, in the order they are asked. */
export function sourcesFor(symbol: string, resolution: Timeframe = "M1"): ProviderId[] {
  return ORDER.filter((id) => PROVIDERS[id].instruments.includes(symbol) && PROVIDERS[id].resolutions.includes(resolution));
}

export function autoSupports(symbol: string, resolution: Timeframe = "M1"): boolean {
  return sourcesFor(symbol, resolution).length > 0;
}

/** Every symbol with automatic history. */
export const AUTO_INSTRUMENTS: string[] = Array.from(new Set(ORDER.flatMap((id) => PROVIDERS[id].instruments)));

/** First year with automatic history (FXCM from 2012; Exness only from 2016). */
export const AUTO_FIRST_YEAR = Math.min(...ORDER.map((id) => PROVIDERS[id].firstYear));

export function autoEarliestT(): number {
  return Date.UTC(AUTO_FIRST_YEAR, 0, 1) / 1000;
}

export const AUTO_SOURCE_NOTE = `${FXCM.name}, with any week FXCM lacks built from ${EXNESS.name}`;

export const AUTO_TERMS = "Both archives are published for personal, informational use; prices are indicative. Stored only in your own database, never redistributed.";

const DAY = 86_400;

/**
 * Sunday that opens the newest finished trading week worth requesting.
 * Exness has each day by the next morning, so a week that closed on Friday
 * is complete about two days later; FXCM follows 1–2 weeks after that.
 */
export function newestWeekSunday(nowSec: number): number {
  return weekSundayOf(nowSec - 2 * DAY);
}

/** Friday close (≈22:00 UTC) of the newest finished week. */
export function newestWeekEnd(nowSec: number): number {
  return newestWeekSunday(nowSec) + 5 * DAY + 22 * 3600;
}

/** Candles in a full trading week (Sunday ~22:00 → Friday ~22:00 UTC). */
export function fullWeekCandles(resolution: Timeframe): number {
  return Math.round((5 * DAY) / TF_SECONDS[resolution]);
}

/** Below this many candles part of the week is missing (normal weeks hold 99 %). */
export function minCompleteCandles(resolution: Timeframe): number {
  return Math.floor(0.85 * fullWeekCandles(resolution));
}

const MAX_GAP = 3 * 3600;

/**
 * Do these candles cover the whole trading week that starts at `week.fromT`
 * (Sunday 12:00 UTC)? Normal FXCM and Exness weeks have 99 % of the minutes
 * and no gap over ~20 minutes (the daily rollover); broken files hold a few
 * hours or nothing. Holiday weeks (25 Dec, 1 Jan) also count as incomplete,
 * so every provider is asked and the fullest one is kept.
 */
export function isCompleteWeek(t: ArrayLike<number>, n: number, week: { fromT: number }, resolution: Timeframe): boolean {
  if (n < minCompleteCandles(resolution)) return false;
  const open = week.fromT + 10 * 3600; // Sunday 22:00 UTC (21:00 in the northern summer)
  const close = week.fromT + 5 * DAY + 9 * 3600; // Friday 21:00 UTC (22:00 in winter)
  if (t[0] > open + MAX_GAP || t[n - 1] < close - MAX_GAP) return false;
  for (let i = 1; i < n; i++) if (t[i] - t[i - 1] > MAX_GAP) return false;
  return true;
}

/**
 * One shared dataset per symbol and resolution. The id keeps its original
 * `fxcm_` prefix so history stored before Exness was added stays in use.
 */
export function providerDatasetId(req: { symbol: string; resolution: Timeframe }): string {
  return `fxcm_${req.symbol}_${req.resolution}`;
}

/** Providers that supplied stored weeks, most-used first. */
export function coverageSources(cov: ProviderCoverage | undefined): ProviderId[] {
  const count = new Map<ProviderId, number>();
  for (const c of Object.values(cov?.chunks ?? {})) if (c.source) count.set(c.source, (count.get(c.source) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** "FXCM", "FXCM + Exness"… — where a downloaded dataset's candles came from. */
export function coverageLabel(cov: ProviderCoverage | undefined, short = true): string {
  const ids = coverageSources(cov);
  if (!ids.length) return short ? FXCM.short : FXCM.name;
  return ids.map((id) => (short || ids.length > 1 ? PROVIDERS[id].short : PROVIDERS[id].name)).join(" + ");
}
