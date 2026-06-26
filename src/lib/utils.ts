import type {
  DayAggregate,
  MonthAggregate,
  Stats,
  Trade,
  TradeWithBalance,
} from "./types";

/** Join class names, skipping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Format a number as currency (compact for large values). */
export function formatCurrency(value: number, opts?: { compact?: boolean }): string {
  const compact = opts?.compact && Math.abs(value) >= 10000;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 2 : Math.abs(value) >= 1000 ? 0 : 2,
  }).format(value);
  return formatted;
}

/** Signed currency, e.g. +$1,200 / -$340. */
export function formatSignedCurrency(value: number, opts?: { compact?: boolean }): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value), opts)}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** Local yyyy-mm-dd key for a date (avoids UTC off-by-one issues). */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's date as a yyyy-mm-dd string in local time. */
export function todayKey(): string {
  return dateKey(new Date());
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF"];

/** A trade is closed once it has a closeDate. */
export function isClosed(trade: Trade): boolean {
  return Boolean(trade.closeDate);
}

/** The date that "realizes" a trade for stats: its close date, else open date. */
export function effectiveDate(trade: Trade): string {
  return trade.closeDate ?? trade.openDate;
}

/** Sort closed trades chronologically by their realized date. */
export function sortClosedChronologically(trades: Trade[]): Trade[] {
  return trades
    .filter(isClosed)
    .slice()
    .sort((a, b) => {
      const cmp = effectiveDate(a).localeCompare(effectiveDate(b));
      return cmp !== 0 ? cmp : a.createdAt.localeCompare(b.createdAt);
    });
}

/** Compute aggregate performance stats. Only closed trades count towards results. */
export function computeStats(trades: Trade[], startingBalance = 0): Stats {
  const closed = trades.filter(isClosed);
  const open = trades.length - closed.length;

  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const breakeven = closed.filter((t) => t.pnl === 0).length;

  const netPnl = closed.reduce((sum, t) => sum + t.pnl, 0);
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

  const closedCount = closed.length;
  const winRate = closedCount ? (wins.length / closedCount) * 100 : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const profitFactor = grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const avgPerTrade = closedCount ? netPnl / closedCount : 0;

  const lossRate = closedCount ? losses.length / closedCount : 0;
  const winRateFraction = closedCount ? wins.length / closedCount : 0;
  const expectancy = winRateFraction * avgWin - lossRate * avgLoss;

  const rTrades = closed.filter((t) => t.rr !== null && t.rr !== undefined);
  const totalR = rTrades.reduce((sum, t) => sum + (t.rr ?? 0), 0);
  const avgRr = rTrades.length ? totalR / rTrades.length : 0;

  const { maxWinStreak, maxLossStreak } = computeStreaks(closed);

  const byDay = aggregateByDay(closed);
  const dayPnls = byDay.map((d) => d.pnl);
  const bestDay = dayPnls.length ? Math.max(...dayPnls) : 0;
  const worstDay = dayPnls.length ? Math.min(...dayPnls) : 0;

  const currentBalance = startingBalance + netPnl;
  const returnPct = startingBalance ? (netPnl / startingBalance) * 100 : 0;

  return {
    netPnl,
    totalTrades: trades.length,
    openTrades: open,
    closedTrades: closedCount,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    bestDay,
    worstDay,
    avgPerTrade,
    expectancy,
    avgRr,
    totalR,
    maxWinStreak,
    maxLossStreak,
    startingBalance,
    currentBalance,
    returnPct,
  };
}

function computeStreaks(closed: Trade[]): {
  maxWinStreak: number;
  maxLossStreak: number;
} {
  const ordered = sortClosedChronologically(closed);
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let win = 0;
  let loss = 0;
  for (const t of ordered) {
    if (t.pnl > 0) {
      win += 1;
      loss = 0;
      maxWinStreak = Math.max(maxWinStreak, win);
    } else if (t.pnl < 0) {
      loss += 1;
      win = 0;
      maxLossStreak = Math.max(maxLossStreak, loss);
    } else {
      win = 0;
      loss = 0;
    }
  }
  return { maxWinStreak, maxLossStreak };
}

/** Group closed trades by their realized (close) day. */
export function aggregateByDay(trades: Trade[]): DayAggregate[] {
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

/** Group closed trades by month. */
export function aggregateByMonth(trades: Trade[]): MonthAggregate[] {
  const map = new Map<string, MonthAggregate>();
  for (const t of trades) {
    if (!isClosed(t)) continue;
    const d = new Date(effectiveDate(t));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
    const existing = map.get(key) ?? {
      month: key,
      label,
      pnl: 0,
      trades: 0,
      wins: 0,
    };
    existing.pnl += t.pnl;
    existing.trades += 1;
    if (t.pnl > 0) existing.wins += 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

/** Equity curve: running account balance after each closed trade. */
export function equitySeries(
  trades: Trade[],
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

/** Attach a running account balance to each closed trade (chronological). */
export function tradesWithRunningBalance(
  trades: Trade[],
  startingBalance = 0,
): TradeWithBalance[] {
  const ordered = sortClosedChronologically(trades);
  let running = startingBalance;
  const map = new Map<string, number>();
  for (const t of ordered) {
    running += t.pnl;
    map.set(t.id, running);
  }
  // Return in the original order with balance where available.
  return trades.map((t) => ({ ...t, balance: map.get(t.id) ?? startingBalance }));
}

/** Format an R multiple like +2R / -1R / 0R. */
export function formatR(rr: number | null | undefined): string {
  if (rr === null || rr === undefined) return "—";
  const sign = rr > 0 ? "+" : "";
  return `${sign}${Number.isInteger(rr) ? rr : rr.toFixed(2)}R`;
}

/** Format a signed percentage, e.g. +2% / -1%. */
export function formatSignedPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  const trimmed = Number.isInteger(value) ? value.toString() : value.toFixed(digits);
  return `${sign}${trimmed}%`;
}
