import { marketSessionOf, monthKeyUtc, tradingWeekday, type MarketSession } from "./time";
import type { JournalEntry, Timeframe, TradeRecord } from "./types";

// Every number here is derived from closed trades in the ledger. Nothing is
// sampled, smoothed or estimated. Definitions live in docs/replay/ANALYTICS.md
// and in METRIC_HELP below (shown as tooltips).

export interface AnalyticsTrade extends TradeRecord {
  strategy: string;
  setup: string;
  tags: string[];
  sessionName: string;
}

export interface AnalyticsFilter {
  /** Inclusive bounds on the trade's exit (realisation) time, unix seconds. */
  from?: number | null;
  to?: number | null;
  symbols?: string[];
  strategies?: string[];
  setups?: string[];
  timeframes?: Timeframe[];
  side?: "all" | "buy" | "sell";
  tags?: string[];
  sessionIds?: string[];
}

export type Outcome = "win" | "loss" | "breakeven";

/** Classify by net P&L; optionally treat |R| ≤ threshold as breakeven. */
export function outcomeOf(t: Pick<TradeRecord, "netPnl" | "rMultiple">, beThresholdR = 0): Outcome {
  if (beThresholdR > 0 && t.rMultiple !== null && Math.abs(t.rMultiple) <= beThresholdR) return "breakeven";
  if (Math.abs(t.netPnl) < 0.005) return "breakeven";
  return t.netPnl > 0 ? "win" : "loss";
}

export function enrichTrades(
  trades: TradeRecord[],
  journal: Record<string, JournalEntry>,
  sessionStrategy: string,
  sessionName: string,
): AnalyticsTrade[] {
  return trades.map((t) => {
    const j = journal[t.id] ?? {};
    return {
      ...t,
      strategy: (j.strategy || sessionStrategy || "Unspecified").trim(),
      setup: (j.setup || "Unspecified").trim(),
      tags: j.tags ?? [],
      sessionName,
    };
  });
}

export function filterTrades(trades: AnalyticsTrade[], f: AnalyticsFilter): AnalyticsTrade[] {
  return trades.filter((t) => {
    if (f.from !== undefined && f.from !== null && t.exitT < f.from) return false;
    if (f.to !== undefined && f.to !== null && t.exitT > f.to) return false;
    if (f.symbols?.length && !f.symbols.includes(t.symbol)) return false;
    if (f.strategies?.length && !f.strategies.includes(t.strategy)) return false;
    if (f.setups?.length && !f.setups.includes(t.setup)) return false;
    if (f.timeframes?.length && !f.timeframes.includes(t.timeframe)) return false;
    if (f.side && f.side !== "all" && t.side !== f.side) return false;
    if (f.tags?.length && !f.tags.some((tag) => t.tags.includes(tag))) return false;
    if (f.sessionIds?.length && !f.sessionIds.includes(t.sessionId)) return false;
    return true;
  });
}

/** Chronological order by exit time, ties by entry time then id. */
export function sortByExit<T extends TradeRecord>(trades: T[]): T[] {
  return trades.slice().sort((a, b) => a.exitT - b.exitT || a.entryT - b.entryT || a.id.localeCompare(b.id));
}

export interface EquityPoint {
  t: number;
  equity: number;
  drawdown: number;
  drawdownPct: number;
  tradeId: string | null;
}

/**
 * Realised equity curve: one point per exit (partial closes included), in
 * chronological order, starting from the initial balance.
 */
export function equityCurve(trades: TradeRecord[], initialBalance: number): EquityPoint[] {
  const exits: { t: number; net: number; tradeId: string; order: number }[] = [];
  let order = 0;
  for (const tr of sortByExit(trades)) {
    for (const e of tr.exits) exits.push({ t: e.t, net: e.net, tradeId: tr.id, order: order++ });
  }
  exits.sort((a, b) => a.t - b.t || a.order - b.order);
  const firstT = trades.length ? Math.min(...trades.map((t) => t.entryT)) : 0;
  const pts: EquityPoint[] = [{ t: firstT, equity: initialBalance, drawdown: 0, drawdownPct: 0, tradeId: null }];
  let eq = initialBalance;
  let peak = initialBalance;
  for (const x of exits) {
    eq += x.net;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    pts.push({ t: x.t, equity: eq, drawdown: dd, drawdownPct: peak > 0 ? (dd / peak) * 100 : 0, tradeId: x.tradeId });
  }
  return pts;
}

export interface DrawdownStats {
  maxDrawdown: number;
  maxDrawdownPct: number;
  peakT: number | null;
  troughT: number | null;
  recoveryT: number | null;
}

/** Max drawdown from the chronological equity curve and its running peak. */
export function drawdownStats(curve: EquityPoint[]): DrawdownStats {
  let peak = curve.length ? curve[0].equity : 0;
  let peakT: number | null = curve.length ? curve[0].t : null;
  const best: DrawdownStats = { maxDrawdown: 0, maxDrawdownPct: 0, peakT: null, troughT: null, recoveryT: null };
  let bestPeakValue = 0;
  for (const p of curve) {
    if (p.equity > peak) {
      peak = p.equity;
      peakT = p.t;
    }
    const dd = peak - p.equity;
    if (dd > best.maxDrawdown + 1e-12) {
      best.maxDrawdown = dd;
      best.peakT = peakT;
      best.troughT = p.t;
      bestPeakValue = peak;
    }
    const pct = peak > 0 ? (dd / peak) * 100 : 0;
    if (pct > best.maxDrawdownPct) best.maxDrawdownPct = pct;
  }
  if (best.troughT !== null) {
    const rec = curve.find((p) => p.t >= (best.troughT as number) && p.equity >= bestPeakValue - 1e-9 && p.t > (best.troughT as number));
    best.recoveryT = rec ? rec.t : null;
  }
  return best;
}

export interface SideStats {
  count: number;
  wins: number;
  winRate: number | null;
  net: number;
  avgR: number | null;
}

export interface Metrics {
  total: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  lossRate: number | null;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  returnPct: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  validR: number;
  avgR: number | null;
  medianR: number | null;
  totalR: number;
  expectancyR: number | null;
  expectancyMoney: number | null;
  profitFactor: number | null;
  profitFactorNote: "finite" | "no-losses" | "no-trades" | "no-profit-no-loss";
  maxDrawdown: number;
  maxDrawdownPct: number;
  ddPeakT: number | null;
  ddTroughT: number | null;
  ddRecoveryT: number | null;
  maxConsecWins: number;
  maxConsecLosses: number;
  largestWin: number | null;
  largestLoss: number | null;
  avgHoldingSeconds: number | null;
  long: SideStats;
  short: SideStats;
  totalCommission: number;
  ambiguousExits: number;
  approxConversion: number;
}

function sideStats(trades: TradeRecord[], beThresholdR: number): SideStats {
  const wins = trades.filter((t) => outcomeOf(t, beThresholdR) === "win").length;
  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r !== null);
  return {
    count: trades.length,
    wins,
    winRate: trades.length ? (wins / trades.length) * 100 : null,
    net: trades.reduce((s, t) => s + t.netPnl, 0),
    avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
  };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeMetrics(trades: TradeRecord[], initialBalance: number, beThresholdR = 0): Metrics {
  const ordered = sortByExit(trades);
  const outcomes = ordered.map((t) => outcomeOf(t, beThresholdR));
  const winsT = ordered.filter((_, i) => outcomes[i] === "win");
  const lossesT = ordered.filter((_, i) => outcomes[i] === "loss");
  const total = ordered.length;
  const grossProfit = winsT.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(lossesT.reduce((s, t) => s + t.netPnl, 0));
  const netPnl = ordered.reduce((s, t) => s + t.netPnl, 0);
  const rs = ordered.map((t) => t.rMultiple).filter((r): r is number => r !== null && Number.isFinite(r));
  const totalR = rs.reduce((s, r) => s + r, 0);

  let profitFactor: number | null = null;
  let profitFactorNote: Metrics["profitFactorNote"] = "finite";
  if (total === 0) profitFactorNote = "no-trades";
  else if (grossLoss === 0 && grossProfit > 0) profitFactorNote = "no-losses";
  else if (grossLoss === 0) profitFactorNote = "no-profit-no-loss";
  else profitFactor = grossProfit / grossLoss;

  let maxConsecWins = 0;
  let maxConsecLosses = 0;
  let w = 0;
  let l = 0;
  for (const o of outcomes) {
    if (o === "win") {
      w++;
      l = 0;
    } else if (o === "loss") {
      l++;
      w = 0;
    } else {
      w = 0;
      l = 0;
    }
    maxConsecWins = Math.max(maxConsecWins, w);
    maxConsecLosses = Math.max(maxConsecLosses, l);
  }

  const dd = drawdownStats(equityCurve(ordered, initialBalance));
  return {
    total,
    wins: winsT.length,
    losses: lossesT.length,
    breakeven: total - winsT.length - lossesT.length,
    winRate: total ? (winsT.length / total) * 100 : null,
    lossRate: total ? (lossesT.length / total) * 100 : null,
    grossProfit,
    grossLoss,
    netPnl,
    returnPct: initialBalance > 0 ? (netPnl / initialBalance) * 100 : null,
    avgWin: winsT.length ? grossProfit / winsT.length : null,
    avgLoss: lossesT.length ? -grossLoss / lossesT.length : null,
    validR: rs.length,
    avgR: rs.length ? totalR / rs.length : null,
    medianR: median(rs),
    totalR,
    expectancyR: rs.length ? totalR / rs.length : null,
    expectancyMoney: total ? netPnl / total : null,
    profitFactor,
    profitFactorNote,
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownPct: dd.maxDrawdownPct,
    ddPeakT: dd.peakT,
    ddTroughT: dd.troughT,
    ddRecoveryT: dd.recoveryT,
    maxConsecWins,
    maxConsecLosses,
    largestWin: winsT.length ? Math.max(...winsT.map((t) => t.netPnl)) : null,
    largestLoss: lossesT.length ? Math.min(...lossesT.map((t) => t.netPnl)) : null,
    avgHoldingSeconds: total ? ordered.reduce((s, t) => s + t.holdingSeconds, 0) / total : null,
    long: sideStats(ordered.filter((t) => t.side === "buy"), beThresholdR),
    short: sideStats(ordered.filter((t) => t.side === "sell"), beThresholdR),
    totalCommission: ordered.reduce((s, t) => s + t.commission, 0),
    ambiguousExits: ordered.filter((t) => t.ambiguous).length,
    approxConversion: ordered.filter((t) => !t.exactConversion).length,
  };
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

export interface GroupRow {
  key: string;
  count: number;
  wins: number;
  winRate: number | null;
  net: number;
  totalR: number;
  avgR: number | null;
}

export function groupBy(trades: TradeRecord[], keyOf: (t: TradeRecord) => string | string[], beThresholdR = 0, order?: string[]): GroupRow[] {
  const map = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const keys = keyOf(t);
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      const arr = map.get(k) ?? [];
      arr.push(t);
      map.set(k, arr);
    }
  }
  const rows = Array.from(map.entries()).map(([key, list]) => {
    const s = sideStats(list, beThresholdR);
    const rs = list.map((t) => t.rMultiple).filter((r): r is number => r !== null);
    return { key, count: s.count, wins: s.wins, winRate: s.winRate, net: s.net, totalR: rs.reduce((a, b) => a + b, 0), avgR: s.avgR };
  });
  if (order) rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  else rows.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return rows;
}

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function byWeekday(trades: TradeRecord[], be = 0): GroupRow[] {
  return groupBy(trades, (t) => WEEKDAY_NAMES[tradingWeekday(t.entryT)], be, WEEKDAY_NAMES);
}

export function byMarketSession(trades: TradeRecord[], be = 0): GroupRow[] {
  const order: MarketSession[] = ["Asia", "London", "London/NY overlap", "New York"];
  return groupBy(trades, (t) => marketSessionOf(t.entryT), be, order);
}

export interface MonthCell {
  month: string; // YYYY-MM
  net: number;
  count: number;
}

export function monthlyPerformance(trades: TradeRecord[]): MonthCell[] {
  const map = new Map<string, MonthCell>();
  for (const t of trades) {
    const k = monthKeyUtc(t.exitT);
    const cell = map.get(k) ?? { month: k, net: 0, count: 0 };
    cell.net += t.netPnl;
    cell.count++;
    map.set(k, cell);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export interface MonthReturn {
  month: string; // YYYY-MM
  /** Net P&L of trades that closed this month. */
  net: number;
  count: number;
  /** Realised balance before the month's first exit. */
  startBalance: number;
  /** Net as a % of the start balance (null when that balance isn't positive). */
  pct: number | null;
}

export interface YearReturn {
  year: string;
  net: number;
  count: number;
  startBalance: number;
  /** End balance ÷ start balance − 1, i.e. the months compounded. */
  pct: number | null;
}

/**
 * Monthly and yearly % returns on the realised balance (FX Replay style).
 * Trades count in the month of their final exit (UTC), in exit order.
 */
export function monthlyReturns(trades: TradeRecord[], initialBalance: number): { months: MonthReturn[]; years: YearReturn[] } {
  const months = new Map<string, MonthReturn>();
  const years = new Map<string, YearReturn>();
  let balance = initialBalance;
  for (const t of sortByExit(trades)) {
    const k = monthKeyUtc(t.exitT);
    const y = k.slice(0, 4);
    const m = months.get(k) ?? { month: k, net: 0, count: 0, startBalance: balance, pct: null };
    const yr = years.get(y) ?? { year: y, net: 0, count: 0, startBalance: balance, pct: null };
    m.net += t.netPnl;
    m.count++;
    yr.net += t.netPnl;
    yr.count++;
    months.set(k, m);
    years.set(y, yr);
    balance += t.netPnl;
  }
  const pct = (net: number, start: number) => (start > 0 ? (net / start) * 100 : null);
  for (const m of months.values()) m.pct = pct(m.net, m.startBalance);
  for (const y of years.values()) y.pct = pct(y.net, y.startBalance);
  return { months: Array.from(months.values()), years: Array.from(years.values()) };
}

export interface DayCell {
  /** UTC day of exit, YYYY-MM-DD. */
  day: string;
  /** 00:00 UTC of that day (seconds). */
  t: number;
  net: number;
  count: number;
  wins: number;
  losses: number;
  /** Running net P&L through the end of this day. */
  cumulative: number;
}

/** Net P&L per UTC exit day (whole trades), with the running total — calendar and daily charts. */
export function dailyPerformance(trades: TradeRecord[], beThresholdR = 0): DayCell[] {
  const map = new Map<string, DayCell>();
  for (const tr of trades) {
    const t = Math.floor(tr.exitT / 86_400) * 86_400;
    const day = new Date(t * 1000).toISOString().slice(0, 10);
    const cell = map.get(day) ?? { day, t, net: 0, count: 0, wins: 0, losses: 0, cumulative: 0 };
    cell.net += tr.netPnl;
    cell.count++;
    const o = outcomeOf(tr, beThresholdR);
    if (o === "win") cell.wins++;
    else if (o === "loss") cell.losses++;
    map.set(day, cell);
  }
  const days = Array.from(map.values()).sort((a, b) => a.t - b.t);
  let run = 0;
  for (const d of days) {
    run += d.net;
    d.cumulative = run;
  }
  return days;
}

export interface Bin {
  label: string;
  from: number;
  to: number;
  count: number;
}

/** R-multiple histogram with 0.5R bins, clamped into overflow bins at ±limits. */
export function rDistribution(trades: TradeRecord[], step = 0.5, min = -3, max = 5): Bin[] {
  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r !== null);
  const bins: Bin[] = [];
  bins.push({ label: `< ${min}R`, from: -Infinity, to: min, count: 0 });
  for (let x = min; x < max - 1e-9; x += step) {
    const a = Math.round(x * 100) / 100;
    const b = Math.round((x + step) * 100) / 100;
    bins.push({ label: `${a}…${b}`, from: a, to: b, count: 0 });
  }
  bins.push({ label: `≥ ${max}R`, from: max, to: Infinity, count: 0 });
  for (const r of rs) {
    const bin = bins.find((b) => r >= b.from && r < b.to);
    if (bin) bin.count++;
  }
  return bins;
}

export function holdingDistribution(trades: TradeRecord[]): Bin[] {
  const edges: [string, number, number][] = [
    ["< 15m", 0, 900],
    ["15m–1h", 900, 3600],
    ["1–4h", 3600, 14_400],
    ["4–24h", 14_400, 86_400],
    ["1–3d", 86_400, 259_200],
    ["> 3d", 259_200, Infinity],
  ];
  const bins = edges.map(([label, from, to]) => ({ label, from, to, count: 0 }));
  for (const t of trades) {
    const b = bins.find((x) => t.holdingSeconds >= x.from && t.holdingSeconds < x.to);
    if (b) b.count++;
  }
  return bins;
}

export function cumulativeR(trades: TradeRecord[]): { t: number; r: number; n: number }[] {
  let r = 0;
  let n = 0;
  const out: { t: number; r: number; n: number }[] = [];
  for (const t of sortByExit(trades)) {
    if (t.rMultiple === null) continue;
    r += t.rMultiple;
    n++;
    out.push({ t: t.exitT, r, n });
  }
  return out;
}

export function rollingWinRate(trades: TradeRecord[], window = 20, be = 0): { n: number; t: number; winRate: number }[] {
  const ordered = sortByExit(trades);
  const out: { n: number; t: number; winRate: number }[] = [];
  for (let i = window - 1; i < ordered.length; i++) {
    const slice = ordered.slice(i - window + 1, i + 1);
    const wins = slice.filter((t) => outcomeOf(t, be) === "win").length;
    out.push({ n: i + 1, t: ordered[i].exitT, winRate: (wins / window) * 100 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plain-English definitions (tooltips)
// ---------------------------------------------------------------------------

export const METRIC_HELP: Record<string, string> = {
  netPnl: "Sum of every closed trade's net P&L (after spread, slippage and commission).",
  returnPct: "Net P&L divided by the starting balance.",
  winRate: "Share of closed trades with a positive net P&L. Breakeven trades count in the total but not as wins.",
  lossRate: "Share of closed trades with a negative net P&L.",
  profitFactor: "Gross profit of winners divided by the absolute gross loss of losers. Above 1 means winners outweighed losers. Shown as “no losses” instead of infinity when there were no losing trades.",
  expectancyR: "Average R-multiple per trade in this sample: what an average trade returned relative to its initial risk. Past results do not guarantee future performance.",
  expectancyMoney: "Average net P&L per closed trade in account currency.",
  avgR: "Mean of all valid R-multiples (trades with an initial stop-loss).",
  medianR: "Middle R-multiple when trades are sorted — less sensitive to outliers than the mean.",
  rMultiple: "Net P&L divided by the money at risk at the initial stop-loss. Moving the stop later never changes the initial risk.",
  maxDrawdown: "Largest fall from a running peak of the realised equity curve (closed trades in time order).",
  maxDrawdownPct: "Largest fall from a running equity peak, as a percentage of that peak.",
  avgWin: "Average net P&L of winning trades.",
  avgLoss: "Average net P&L of losing trades.",
  grossProfit: "Sum of net P&L over winning trades.",
  grossLoss: "Sum of net P&L over losing trades (shown as a positive amount).",
  consec: "Longest run of consecutive wins or losses in exit order. A breakeven trade ends both runs.",
  holding: "Average time between entry and final exit, measured in replay (market) time.",
  largest: "Single best and worst trade by net P&L.",
  ambiguous: "Exits where stop-loss and take-profit were both inside one base candle; the stop was assumed to fill first.",
};
