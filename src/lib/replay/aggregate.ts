import { allocBars, sliceBars } from "./bars";
import { bucketKey, bucketStart, TF_SECONDS } from "./time";
import type { Bars, DayBoundary, Timeframe } from "./types";

export interface ChartBar {
  /** UTC open time of the chart candle. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Index range [first, last] of base bars inside this candle. */
  first: number;
  last: number;
  /** True when the candle's period hasn't fully elapsed at the replay point. */
  forming: boolean;
}

/**
 * Aggregate base bars [0, upto] into chart candles of `tf`.
 *
 * Only bars up to and including `upto` are read, so the result can never
 * contain information from after the replay point. The last candle is marked
 * `forming` when its period ends after the last revealed base bar closes.
 */
export function aggregate(
  base: Bars,
  baseTf: Timeframe,
  tf: Timeframe,
  boundary: DayBoundary,
  upto: number = base.n - 1,
  from = 0,
): ChartBar[] {
  const out: ChartBar[] = [];
  const last = Math.min(upto, base.n - 1);
  if (last < from) return out;
  const same = tf === baseTf;
  let cur: ChartBar | null = null;
  let curKey = NaN;
  for (let i = from; i <= last; i++) {
    const t = base.t[i];
    const key = same ? t : bucketKey(t, tf, boundary);
    if (cur === null || key !== curKey) {
      if (cur) out.push(cur);
      curKey = key;
      cur = {
        time: same ? t : bucketStart(t, tf, boundary),
        open: base.o[i],
        high: base.h[i],
        low: base.l[i],
        close: base.c[i],
        volume: base.v[i],
        first: i,
        last: i,
        forming: false,
      };
    } else {
      if (base.h[i] > cur.high) cur.high = base.h[i];
      if (base.l[i] < cur.low) cur.low = base.l[i];
      cur.close = base.c[i];
      cur.volume += base.v[i];
      cur.last = i;
    }
  }
  if (cur) {
    const revealedUntil = base.t[last] + TF_SECONDS[baseTf];
    const periodEnd = nextBucketStart(cur.time, tf, boundary);
    cur.forming = !same && revealedUntil < periodEnd;
    out.push(cur);
  }
  return out;
}

/** UTC open time of the bucket after the one starting at `start`. */
export function nextBucketStart(start: number, tf: Timeframe, boundary: DayBoundary): number {
  const p = TF_SECONDS[tf];
  if (p <= 3600) return start + p;
  // Probe forward to tolerate DST shifts that make a day 23h/25h long.
  const key = bucketKey(start, tf, boundary);
  let probe = start + p - 3 * 3600;
  while (bucketKey(probe, tf, boundary) === key) probe += 3600;
  return bucketStart(probe, tf, boundary);
}

/** Aggregate into a new Bars structure (used by tests and the explorer). */
export function aggregateToBars(base: Bars, baseTf: Timeframe, tf: Timeframe, boundary: DayBoundary): Bars {
  const candles = aggregate(base, baseTf, tf, boundary);
  const b = allocBars(candles.length);
  candles.forEach((c, i) => {
    b.t[i] = c.time;
    b.o[i] = c.open;
    b.h[i] = c.high;
    b.l[i] = c.low;
    b.c[i] = c.close;
    b.v[i] = c.volume;
  });
  return sliceBars(b, 0, candles.length);
}

/**
 * Index of the last base bar belonging to the chart candle that contains base
 * bar `i` — i.e. where to move the cursor so that candle is complete.
 */
export function endOfCandle(base: Bars, i: number, tf: Timeframe, baseTf: Timeframe, boundary: DayBoundary): number {
  if (tf === baseTf) return i;
  const key = bucketKey(base.t[i], tf, boundary);
  let j = i;
  while (j + 1 < base.n && bucketKey(base.t[j + 1], tf, boundary) === key) j++;
  return j;
}

/** Index of the first base bar of the chart candle containing base bar `i`. */
export function startOfCandle(base: Bars, i: number, tf: Timeframe, baseTf: Timeframe, boundary: DayBoundary): number {
  if (tf === baseTf) return i;
  const key = bucketKey(base.t[i], tf, boundary);
  let j = i;
  while (j - 1 >= 0 && bucketKey(base.t[j - 1], tf, boundary) === key) j--;
  return j;
}
