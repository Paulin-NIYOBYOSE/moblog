// Pure analytics functions for the Testing (backtesting) module — adapted
// from src/lib/utils.ts + src/lib/analytics.ts but parameterized for
// BacktestTrade[]/Session[] since the Testing data model is intentionally
// separate from the live journal's Trade/Account.

import { MONTHS, WEEKDAYS, dateKey } from "@/lib/utils";
import type { BacktestTrade, Session } from "./types";

export function isClosed(trade: BacktestTrade): boolean {
  return Boolean(trade.closeDate);
}

export function effectiveDate(trade: BacktestTrade): string {
  return trade.closeDate ?? trade.openDate;
}

export function sortClosedChronologically(trades: BacktestTrade[]): BacktestTrade[] {
  return trades
    .filter(isClosed)
    .slice()
    .sort((a, b) => {
      const cmp = effectiveDate(a).localeCompare(effectiveDate(b));
      return cmp !== 0 ? cmp : a.createdAt.localeCompare(b.createdAt);
    });
}

/** A trade counts as breakeven once its |pnl| falls within the threshold. */
export function classifyOutcome(pnl: number, breakevenThreshold: number): "WIN" | "LOSS" | "BREAKEVEN" {
  if (Math.abs(pnl) <= breakevenThreshold) return "BREAKEVEN";
  return pnl > 0 ? "WIN" : "LOSS";
}

export interface TestingStats {
  netPnl: number;
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  avgPerTrade: number;
  expectancy: number;
  startingBalance: number;
  currentBalance: number;
  returnPct: number;
}

export function computeStats(
  trades: BacktestTrade[],
  startingBalance = 0,
  breakevenThreshold = 0,
): TestingStats {
  const closed = trades.filter(isClosed);
  const open = trades.length - closed.length;

  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let netPnl = 0;

  for (const t of closed) {
    netPnl += t.pnl;
    const outcome = classifyOutcome(t.pnl, breakevenThreshold);
    if (outcome === "WIN") {
      wins += 1;
      grossProfit += t.pnl;
    } else if (outcome === "LOSS") {
      losses += 1;
      grossLoss += Math.abs(t.pnl);
    } else {
      breakeven += 1;
    }
  }

  const closedCount = closed.length;
  const winRate = closedCount ? (wins / closedCount) * 100 : 0;
  const avgWin = wins ? grossProfit / wins : 0;
  const avgLoss = losses ? grossLoss / losses : 0;
  const profitFactor = grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const avgPerTrade = closedCount ? netPnl / closedCount : 0;

  const winRateFraction = closedCount ? wins / closedCount : 0;
  const lossRateFraction = closedCount ? losses / closedCount : 0;
  const expectancy = winRateFraction * avgWin - lossRateFraction * avgLoss;

  const currentBalance = startingBalance + netPnl;
  const returnPct = startingBalance ? (netPnl / startingBalance) * 100 : 0;

  return {
    netPnl,
    totalTrades: trades.length,
    openTrades: open,
    closedTrades: closedCount,
    wins,
    losses,
    breakeven,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    avgPerTrade,
    expectancy,
    startingBalance,
    currentBalance,
    returnPct,
  };
}

export interface DayAggregate {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
}

export function aggregateByDay(trades: BacktestTrade[]): DayAggregate[] {
  const map = new Map<string, DayAggregate>();
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const key = dateKey(new Date(effectiveDate(t)));
    const existing = map.get(key) ?? { date: key, pnl: 0, trades: 0, wins: 0 };
    existing.pnl += t.pnl;
    existing.trades += 1;
    if (t.pnl > 0) existing.wins += 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export interface MonthAggregate {
  month: string; // yyyy-mm
  label: string;
  pnl: number;
  trades: number;
  wins: number;
}

export function aggregateByMonth(trades: BacktestTrade[]): MonthAggregate[] {
  const map = new Map<string, MonthAggregate>();
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const d = new Date(effectiveDate(t));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
    const existing = map.get(key) ?? { month: key, label, pnl: 0, trades: 0, wins: 0 };
    existing.pnl += t.pnl;
    existing.trades += 1;
    if (t.pnl > 0) existing.wins += 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export interface WeekdayAggregate {
  weekday: number;
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
}

export function aggregateByWeekday(trades: BacktestTrade[]): WeekdayAggregate[] {
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

/** Equity curve: running combined balance after each closed trade day. */
export function equitySeries(
  trades: BacktestTrade[],
  startingBalance = 0,
): { date: string; value: number }[] {
  const byDay = aggregateByDay(trades);
  let running = startingBalance;
  const series = [{ date: "start", value: startingBalance }];
  for (const d of byDay) {
    running += d.pnl;
    series.push({ date: d.date, value: running });
  }
  return series;
}

/** Per-trade equity curve (finest granularity available — no intraday data). */
export function equitySeriesPerTrade(
  trades: BacktestTrade[],
  startingBalance = 0,
): { date: string; value: number }[] {
  const ordered = sortClosedChronologically(trades);
  let running = startingBalance;
  const series = [{ date: "start", value: startingBalance }];
  for (const t of ordered) {
    running += t.pnl;
    series.push({ date: effectiveDate(t), value: running });
  }
  return series;
}

export interface DrawdownPoint {
  date: string;
  equity: number;
  peak: number;
  drawdown: number;
  drawdownPct: number;
}

export interface DrawdownStats {
  maxDrawdown: number;
  maxDrawdownPct: number;
  currentDrawdown: number;
  currentDrawdownPct: number;
  longestDrawdownDays: number;
  series: DrawdownPoint[];
}

export function computeDrawdown(trades: BacktestTrade[], startingBalance = 0): DrawdownStats {
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
    const drawdown = p.value - peak;
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
// Performance-by-month matrix — supports the two toggles from the screenshot:
// "Accum. Sessions Gains %" (sum of each session's own % return) vs "Overall
// Gain %" (combined pnl over combined balance), and Initial vs Current
// balance as the % divisor.
// ---------------------------------------------------------------------------

export type GainMode = "ACCUM" | "OVERALL";
export type BalanceMode = "INITIAL" | "CURRENT";

export interface MonthlyMatrixCell {
  pnl: number;
  returnPct: number;
  trades: number;
}

export interface MonthlyMatrixRow {
  year: string;
  months: (MonthlyMatrixCell | null)[];
  yearPnl: number;
  yearReturnPct: number;
}

export function monthlyReturnMatrix(
  trades: BacktestTrade[],
  sessions: Session[],
  gainMode: GainMode,
  balanceMode: BalanceMode,
): MonthlyMatrixRow[] {
  const bySession = new Map<string, BacktestTrade[]>();
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const list = bySession.get(t.sessionId) ?? [];
    list.push(t);
    bySession.set(t.sessionId, list);
  }

  // Per session: monthly pnl map + balance-at-start-of-month lookup.
  const sessionMonthly = new Map<string, Map<string, { pnl: number; trades: number }>>();
  const sessionStartBalance = new Map<string, number>();
  for (const s of sessions) sessionStartBalance.set(s.id, s.startingBalance);

  for (const [sessionId, sTrades] of bySession) {
    const monthly = new Map<string, { pnl: number; trades: number }>();
    for (const m of aggregateByMonth(sTrades)) {
      monthly.set(m.month, { pnl: m.pnl, trades: m.trades });
    }
    sessionMonthly.set(sessionId, monthly);
  }

  function balanceAtStartOfMonth(sessionId: string, monthKey: string): number {
    const start = sessionStartBalance.get(sessionId) ?? 0;
    const monthly = sessionMonthly.get(sessionId);
    if (!monthly) return start;
    let running = start;
    const priorMonths = Array.from(monthly.keys())
      .filter((m) => m < monthKey)
      .sort();
    for (const m of priorMonths) running += monthly.get(m)!.pnl;
    return running;
  }

  // Collect every year-month key that has at least one closed trade.
  const allMonthKeys = new Set<string>();
  for (const monthly of sessionMonthly.values()) {
    for (const key of monthly.keys()) allMonthKeys.add(key);
  }

  const rows = new Map<string, MonthlyMatrixRow>();
  const combinedInitialBalance = sessions.reduce((sum, s) => sum + s.startingBalance, 0);

  for (const monthKey of allMonthKeys) {
    const [year, monthStr] = monthKey.split("-");
    const monthIndex = Number(monthStr) - 1;
    let row = rows.get(year);
    if (!row) {
      row = { year, months: Array(12).fill(null), yearPnl: 0, yearReturnPct: 0 };
      rows.set(year, row);
    }

    let cellPnl = 0;
    let cellTrades = 0;
    let accumReturnPct = 0;
    let combinedStartBalance = 0;

    for (const s of sessions) {
      const monthly = sessionMonthly.get(s.id);
      const entry = monthly?.get(monthKey);
      const sessionPnl = entry?.pnl ?? 0;
      cellPnl += sessionPnl;
      cellTrades += entry?.trades ?? 0;

      const divisor =
        balanceMode === "INITIAL"
          ? sessionStartBalance.get(s.id) ?? 0
          : balanceAtStartOfMonth(s.id, monthKey);
      combinedStartBalance += divisor;
      if (entry && divisor) accumReturnPct += (sessionPnl / divisor) * 100;
    }

    const overallDivisor = balanceMode === "INITIAL" ? combinedInitialBalance : combinedStartBalance;
    const returnPct =
      gainMode === "ACCUM" ? accumReturnPct : overallDivisor ? (cellPnl / overallDivisor) * 100 : 0;

    row.months[monthIndex] = { pnl: cellPnl, returnPct, trades: cellTrades };
    row.yearPnl += cellPnl;
  }

  for (const row of rows.values()) {
    if (gainMode === "ACCUM") {
      row.yearReturnPct = row.months.reduce((sum, c) => sum + (c?.returnPct ?? 0), 0);
    } else {
      const divisor = balanceMode === "INITIAL" ? combinedInitialBalance : combinedInitialBalance;
      row.yearReturnPct = divisor ? (row.yearPnl / divisor) * 100 : 0;
    }
  }

  return Array.from(rows.values()).sort((a, b) => a.year.localeCompare(b.year));
}
