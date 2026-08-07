// Extended analytics — additive on top of src/lib/utils.ts.
//
// Everything here is a pure function that *consumes* the existing
// canonical helpers (isClosed, effectiveDate, equitySeries, computeStats,
// WEEKDAYS, aggregateByDay) rather than redefining what "closed" or
// "effective date" mean. None of it changes any value utils.ts already
// produces — it only adds new, derived views on top of the same trades.

import type {
  BreakdownEntry,
  ConsistencyScore,
  DrawdownPoint,
  DrawdownStats,
  DurationStats,
  MonthlyMatrixRow,
  PeriodComparison,
  RMultipleBucket,
  Trade,
  WeekdayAggregate,
  YearAggregate,
} from "./types";
import {
  aggregateByDay,
  aggregateByMonth,
  computeStats,
  dateKey,
  effectiveDate,
  equitySeries,
  isClosed,
  WEEKDAYS,
} from "./utils";

// ---------------------------------------------------------------------------
// Generic field breakdown
// ---------------------------------------------------------------------------

/**
 * Groups closed trades by an arbitrary key, returning pnl/win-rate/avg-R per
 * group sorted by pnl descending. `keyFn` returning null excludes that trade
 * from the breakdown entirely (used by breakdownBySetup to skip untagged
 * trades, matching the previous inline `topSetups()` behavior).
 */
export function breakdownByField(
  trades: Trade[],
  keyFn: (t: Trade) => string | null,
): BreakdownEntry[] {
  const map = new Map<
    string,
    { pnl: number; trades: number; wins: number; rSum: number; rCount: number }
  >();
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const key = keyFn(t);
    if (key === null) continue;
    const entry = map.get(key) ?? { pnl: 0, trades: 0, wins: 0, rSum: 0, rCount: 0 };
    entry.pnl += t.pnl;
    entry.trades += 1;
    if (t.pnl > 0) entry.wins += 1;
    if (t.rr !== null && t.rr !== undefined) {
      entry.rSum += t.rr;
      entry.rCount += 1;
    }
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      label: key,
      pnl: v.pnl,
      trades: v.trades,
      wins: v.wins,
      winRate: v.trades ? (v.wins / v.trades) * 100 : 0,
      avgR: v.rCount ? v.rSum / v.rCount : null,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

export function bestWorstAssets(
  trades: Trade[],
  limit = 5,
): { best: BreakdownEntry[]; worst: BreakdownEntry[] } {
  const all = breakdownByField(trades, (t) => t.pair);
  const byPnlDesc = all.slice().sort((a, b) => b.pnl - a.pnl);
  const byPnlAsc = all.slice().sort((a, b) => a.pnl - b.pnl);
  return { best: byPnlDesc.slice(0, limit), worst: byPnlAsc.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// Time-based aggregation (weekday, year — month already exists in utils.ts)
// ---------------------------------------------------------------------------

export function aggregateByWeekday(trades: Trade[]): WeekdayAggregate[] {
  const buckets: WeekdayAggregate[] = WEEKDAYS.map((label, weekday) => ({
    weekday,
    label,
    pnl: 0,
    trades: 0,
    wins: 0,
    winRate: 0,
  }));
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const bucket = buckets[new Date(effectiveDate(t)).getDay()];
    bucket.pnl += t.pnl;
    bucket.trades += 1;
    if (t.pnl > 0) bucket.wins += 1;
  }
  for (const b of buckets) b.winRate = b.trades ? (b.wins / b.trades) * 100 : 0;
  return buckets;
}

export function aggregateByYear(trades: Trade[]): YearAggregate[] {
  const map = new Map<string, YearAggregate>();
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const year = String(new Date(effectiveDate(t)).getFullYear());
    const existing = map.get(year) ?? { year, pnl: 0, trades: 0, wins: 0 };
    existing.pnl += t.pnl;
    existing.trades += 1;
    if (t.pnl > 0) existing.wins += 1;
    map.set(year, existing);
  }
  return Array.from(map.values()).sort((a, b) => a.year.localeCompare(b.year));
}

// ---------------------------------------------------------------------------
// Drawdown — built directly on top of equitySeries(), not reimplemented
// ---------------------------------------------------------------------------

export function computeDrawdown(trades: Trade[], startingBalance = 0): DrawdownStats {
  const series = equitySeries(trades, startingBalance);
  let peak = startingBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let longest = 0;
  let currentRun = 0;
  const points: DrawdownPoint[] = [];

  for (const p of series) {
    if (p.date === "start") continue;
    peak = Math.max(peak, p.value);
    const drawdown = p.value - peak; // <= 0
    const drawdownPct = peak !== 0 ? (drawdown / peak) * 100 : 0;
    points.push({ date: p.date, equity: p.value, peak, drawdown, drawdownPct });
    maxDrawdown = Math.max(maxDrawdown, -drawdown);
    maxDrawdownPct = Math.max(maxDrawdownPct, -drawdownPct);
    if (drawdown < 0) {
      currentRun += 1;
      longest = Math.max(longest, currentRun);
    } else {
      currentRun = 0;
    }
  }

  const last = points[points.length - 1];
  return {
    maxDrawdown,
    maxDrawdownPct,
    currentDrawdown: last ? -last.drawdown : 0,
    currentDrawdownPct: last ? -last.drawdownPct : 0,
    longestDrawdownDays: longest,
    series: points,
  };
}

// ---------------------------------------------------------------------------
// Trade duration
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const minutes = Math.round(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (!days && mins) parts.push(`${mins}m`);
  return parts.length ? parts.join(" ") : "<1m";
}

export function computeTradeDurations(trades: Trade[]): DurationStats {
  const durations = trades
    .filter(isClosed)
    .map((t) => ({
      ms: new Date(t.closeDate as string).getTime() - new Date(t.openDate).getTime(),
      pnl: t.pnl,
    }))
    .filter((d) => Number.isFinite(d.ms) && d.ms >= 0);

  const count = durations.length;
  const avgDurationMs = count ? durations.reduce((s, d) => s + d.ms, 0) / count : 0;

  const sortedMs = durations.map((d) => d.ms).sort((a, b) => a - b);
  const mid = Math.floor(sortedMs.length / 2);
  const medianDurationMs = sortedMs.length
    ? sortedMs.length % 2
      ? sortedMs[mid]
      : (sortedMs[mid - 1] + sortedMs[mid]) / 2
    : 0;

  const winners = durations.filter((d) => d.pnl > 0);
  const losers = durations.filter((d) => d.pnl < 0);
  const avgWinnerDurationMs = winners.length
    ? winners.reduce((s, d) => s + d.ms, 0) / winners.length
    : 0;
  const avgLoserDurationMs = losers.length
    ? losers.reduce((s, d) => s + d.ms, 0) / losers.length
    : 0;

  return {
    count,
    avgDurationMs,
    avgDurationLabel: formatDuration(avgDurationMs),
    medianDurationMs,
    medianDurationLabel: formatDuration(medianDurationMs),
    avgWinnerDurationMs,
    avgLoserDurationMs,
  };
}

// ---------------------------------------------------------------------------
// R-multiple distribution
// ---------------------------------------------------------------------------

export function computeRMultipleDistribution(
  trades: Trade[],
  bucketSize = 0.5,
): RMultipleBucket[] {
  const limit = 3;
  const bucketCount = Math.round((limit * 2) / bucketSize);
  const buckets: RMultipleBucket[] = [];
  buckets.push({ bucket: `≤ -${limit}R`, min: -Infinity, max: -limit, count: 0, pnl: 0 });
  for (let i = 0; i < bucketCount; i++) {
    const min = -limit + i * bucketSize;
    const max = min + bucketSize;
    const label = `${min >= 0 ? "+" : ""}${Number(min.toFixed(2))}R`;
    buckets.push({ bucket: label, min, max, count: 0, pnl: 0 });
  }
  buckets.push({ bucket: `≥ +${limit}R`, min: limit, max: Infinity, count: 0, pnl: 0 });

  for (const t of trades) {
    if (!isClosed(t)) continue;
    const v = t.rr;
    if (v === null || v === undefined) continue;
    let idx: number;
    if (v < -limit) idx = 0;
    else if (v >= limit) idx = buckets.length - 1;
    else idx = 1 + Math.min(bucketCount - 1, Math.floor((v + limit) / bucketSize));
    buckets[idx].count += 1;
    buckets[idx].pnl += t.pnl;
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Consistency score
// ---------------------------------------------------------------------------

/**
 * Score (0-100) measuring how evenly profits are spread across profitable
 * days, rather than concentrated in one outlier day.
 *
 * Formula: `topDayContributionPct` is the single best day's share of total
 * gross profit across all profitable days. `fairSharePct` is what that day
 * "should" be worth if profit were spread evenly (100 / profitable days).
 * `score = 100 - max(0, topDayContributionPct - fairSharePct)` — a trader
 * whose best day looks proportionate to their number of winning days scores
 * near 100; one who made all their money in a single session scores low.
 * Purely descriptive — never used as an input to any existing Stats field.
 */
export function computeConsistencyScore(trades: Trade[]): ConsistencyScore {
  const days = aggregateByDay(trades);
  const profitableDays = days.filter((d) => d.pnl > 0);
  const totalPositive = profitableDays.reduce((s, d) => s + d.pnl, 0);
  const bestDayPnl = profitableDays.length ? Math.max(...profitableDays.map((d) => d.pnl)) : 0;

  const topDayContributionPct = totalPositive > 0 ? (bestDayPnl / totalPositive) * 100 : 0;
  const fairSharePct = profitableDays.length ? 100 / profitableDays.length : 0;
  const profitableDaysPct = days.length ? (profitableDays.length / days.length) * 100 : 0;

  const excess = Math.max(0, topDayContributionPct - fairSharePct);
  const score = days.length ? Math.max(0, Math.min(100, 100 - excess)) : 0;

  return { score, topDayContributionPct, fairSharePct, profitableDaysPct };
}

// ---------------------------------------------------------------------------
// Period comparison — reuses the canonical computeStats for both slices
// ---------------------------------------------------------------------------

export function comparePeriods(
  trades: Trade[],
  startingBalance: number,
  currentRange: [string, string],
  previousRange: [string, string],
): PeriodComparison {
  const inRange = (t: Trade, [from, to]: [string, string]) => {
    const key = dateKey(new Date(effectiveDate(t)));
    return key >= from && key <= to;
  };
  const current = computeStats(
    trades.filter((t) => inRange(t, currentRange)),
    startingBalance,
  );
  const previous = computeStats(
    trades.filter((t) => inRange(t, previousRange)),
    startingBalance,
  );
  const finitePF = (v: number) => (Number.isFinite(v) ? v : 0);
  return {
    current,
    previous,
    deltaNetPnl: current.netPnl - previous.netPnl,
    deltaWinRate: current.winRate - previous.winRate,
    deltaProfitFactor: finitePF(current.profitFactor) - finitePF(previous.profitFactor),
    deltaExpectancy: current.expectancy - previous.expectancy,
  };
}

// ---------------------------------------------------------------------------
// Month × year performance matrix (YTD-style report)
// ---------------------------------------------------------------------------

/**
 * Built directly on top of the existing aggregateByMonth() — groups its
 * monthly totals into one row per year with 12 month cells (null where the
 * account had no closed trades that month) plus a year total. `returnPct`
 * is each cell's pnl as a percentage of the account's fixed starting
 * balance, matching the convention `computeStats().returnPct` already uses
 * (not a compounding month-over-month return).
 */
export function monthlyReturnMatrix(trades: Trade[], startingBalance: number): MonthlyMatrixRow[] {
  const rows = new Map<string, MonthlyMatrixRow>();
  for (const m of aggregateByMonth(trades)) {
    const [year, monthStr] = m.month.split("-");
    const monthIndex = Number(monthStr) - 1;
    let row = rows.get(year);
    if (!row) {
      row = { year, months: Array(12).fill(null), yearPnl: 0, yearReturnPct: 0 };
      rows.set(year, row);
    }
    row.months[monthIndex] = {
      pnl: m.pnl,
      returnPct: startingBalance ? (m.pnl / startingBalance) * 100 : 0,
      trades: m.trades,
    };
    row.yearPnl += m.pnl;
  }
  for (const row of rows.values()) {
    row.yearReturnPct = startingBalance ? (row.yearPnl / startingBalance) * 100 : 0;
  }
  return Array.from(rows.values()).sort((a, b) => a.year.localeCompare(b.year));
}
