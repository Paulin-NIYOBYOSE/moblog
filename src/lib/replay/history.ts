import type { ChartBar } from "./aggregate";
import { bucketStart, TF_SECONDS } from "./time";
import type { DayBoundary, Timeframe } from "./types";

// Long history before the replay start (months to years) is for reading the
// chart, not for trading: the engine never fills orders before the start.
// Loading years of 1-minute candles would cost hundreds of MB in the browser,
// so only the last FINE_HISTORY_DAYS are base candles; anything older is
// loaded as hourly "context" candles and shown on timeframes of 1h and up.

/** Base-resolution history kept before the start (≈3 months). */
export const FINE_HISTORY_DAYS = 92;
/** Resolution of the older history. */
export const CONTEXT_TF: Timeframe = "H1";

export interface HistoryPlan {
  /** First base candle to load. */
  fineFromT: number;
  /** Older history loaded as hourly candles for the chart, or null when not needed. */
  context: { fromT: number; toT: number } | null;
}

export function historyPlan(s: { historyStartT: number; startT: number }, baseTf: Timeframe, boundary: DayBoundary): HistoryPlan {
  const whole: HistoryPlan = { fineFromT: s.historyStartT, context: null };
  if (TF_SECONDS[baseTf] >= TF_SECONDS[CONTEXT_TF]) return whole; // base data is already hourly or coarser
  if (s.startT - s.historyStartT <= FINE_HISTORY_DAYS * 86_400) return whole;
  // Start the base data on a weekly boundary, so no chart candle (1h … 1W) mixes both sources.
  const fineFromT = bucketStart(s.startT - FINE_HISTORY_DAYS * 86_400, "W1", boundary);
  if (fineFromT <= s.historyStartT) return whole;
  return { fineFromT, context: { fromT: s.historyStartT, toT: fineFromT } };
}

/** Can a chart timeframe show the hourly context? (Lower timeframes start where the base data starts.) */
export function showsContext(tf: Timeframe): boolean {
  return TF_SECONDS[tf] >= TF_SECONDS[CONTEXT_TF];
}

/** Context candles (older, from hourly data) followed by candles built from base data. */
export function withContext(context: ChartBar[], fine: ChartBar[]): ChartBar[] {
  if (!context.length) return fine;
  if (!fine.length) return context;
  const firstFine = fine[0].time;
  let n = context.length;
  while (n > 0 && context[n - 1].time >= firstFine) n--;
  return n === context.length ? context.concat(fine) : context.slice(0, n).concat(fine);
}
