export type Direction = "LONG" | "SHORT";

export type ContentStatus = "IDEA" | "DRAFT" | "READY" | "PUBLISHED" | "ARCHIVED";

export type Platform = "INSTAGRAM" | "TIKTOK" | "YOUTUBE" | "X" | "LINKEDIN" | "TWITCH";

export type ContentType = "SHORT" | "LIVE_STREAM" | "PHOTOS" | "TEXT_STORY" | "REEL" | "POST" | "THREAD" | "VIDEO";

export interface Account {
  id: string;
  name: string;
  currency: string;
  startingBalance: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  // Optional aggregates the API may include.
  tradeCount?: number;
  netPnl?: number;
  balance?: number;
}

// Shape returned by the API (dates serialized to ISO strings).
export interface Trade {
  id: string;
  accountId: string;
  openDate: string;
  closeDate: string | null;
  pair: string;
  direction: Direction;
  exitLogic: string | null;
  pnl: number;
  roi: number | null;
  rr: number | null;
  entry: number | null;
  exit: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  size: number | null;
  riskAmount: number | null;
  setup: string | null;
  comment: string | null;
  chartUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// Payload used when creating / editing a trade from the form.
export interface TradeInput {
  accountId: string;
  openDate: string; // yyyy-mm-dd
  closeDate?: string | null; // yyyy-mm-dd or null for open trades
  pair: string;
  direction: Direction;
  exitLogic?: string | null;
  pnl: number;
  roi?: number | null;
  rr?: number | null;
  entry?: number | null;
  exit?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  size?: number | null;
  riskAmount?: number | null;
  setup?: string | null;
  comment?: string | null;
  chartUrl?: string | null;
}

export interface AccountInput {
  name: string;
  currency: string;
  startingBalance: number;
}

export interface Stats {
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
  bestDay: number;
  worstDay: number;
  avgPerTrade: number;
  expectancy: number;
  avgRr: number;
  totalR: number;
  maxWinStreak: number;
  maxLossStreak: number;
  startingBalance: number;
  currentBalance: number;
  returnPct: number;
}

export interface DayAggregate {
  date: string; // yyyy-mm-dd
  pnl: number;
  trades: number;
  wins: number;
}

export interface MonthAggregate {
  month: string; // yyyy-mm
  label: string; // e.g. "Jan 2026"
  pnl: number;
  trades: number;
  wins: number;
}

// A trade with its running account balance attached (after the trade closed).
export interface TradeWithBalance extends Trade {
  balance: number;
}

export interface Content {
  id: string;
  title: string;
  status: ContentStatus;
  platforms: Platform[];
  publishDate: string | null;
  type: ContentType;
  url: string | null;
  visuals: string | null;
  nextStatus: string | null;
  notes: string | null;
  topics: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentInput {
  title: string;
  status: ContentStatus;
  platforms: Platform[];
  publishDate?: string | null;
  type: ContentType;
  url?: string | null;
  visuals?: string | null;
  nextStatus?: string | null;
  notes?: string | null;
  topics: string[];
}

// ---------------------------------------------------------------------------
// Extended analytics (src/lib/analytics.ts) — additive, built on top of the
// existing Trade/Stats shapes above. Never used to redefine "closed" or
// "effective date" semantics, which stay owned by utils.ts.
// ---------------------------------------------------------------------------

export interface BreakdownEntry {
  key: string;
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
  avgR: number | null;
}

export interface WeekdayAggregate {
  weekday: number; // 0 = Sunday .. 6 = Saturday
  label: string;
  pnl: number;
  trades: number;
  wins: number;
  winRate: number;
}

export interface YearAggregate {
  year: string;
  pnl: number;
  trades: number;
  wins: number;
}

export interface DrawdownPoint {
  date: string;
  equity: number;
  peak: number;
  drawdown: number; // <= 0, in account currency
  drawdownPct: number; // <= 0, percent of peak
}

export interface DrawdownStats {
  maxDrawdown: number; // magnitude, >= 0
  maxDrawdownPct: number; // magnitude, >= 0
  currentDrawdown: number; // magnitude, >= 0
  currentDrawdownPct: number; // magnitude, >= 0
  longestDrawdownDays: number;
  series: DrawdownPoint[];
}

export interface DurationStats {
  count: number;
  avgDurationMs: number;
  avgDurationLabel: string;
  medianDurationMs: number;
  medianDurationLabel: string;
  avgWinnerDurationMs: number;
  avgLoserDurationMs: number;
}

export interface RMultipleBucket {
  bucket: string;
  min: number;
  max: number;
  count: number;
  pnl: number;
}

export interface ConsistencyScore {
  score: number; // 0-100, higher = more evenly distributed profits
  topDayContributionPct: number;
  fairSharePct: number;
  profitableDaysPct: number;
}

export interface PeriodComparison {
  current: Stats;
  previous: Stats;
  deltaNetPnl: number;
  deltaWinRate: number;
  deltaProfitFactor: number;
  deltaExpectancy: number;
}

export interface MonthlyMatrixCell {
  pnl: number;
  returnPct: number; // relative to the account's startingBalance
  trades: number;
}

export interface MonthlyMatrixRow {
  year: string;
  months: (MonthlyMatrixCell | null)[]; // 12 entries, Jan (0) .. Dec (11); null = no closed trades that month
  yearPnl: number;
  yearReturnPct: number;
}

// ---------------------------------------------------------------------------
// Backtesting Series (src/lib/backtesting.ts) — tracks the 168-item
// (instrument x year) backtesting plan. Independent of trades/journaling.
// ---------------------------------------------------------------------------

export interface BacktestItem {
  id: string;
  instrument: string;
  year: number;
  sequence: number;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaceStatus = "ahead" | "on_track" | "behind";

export interface BacktestingSummary {
  total: number;
  completed: number;
  percent: number;
  remaining: number;
  daysRemaining: number;
  expectedCompletionDate: string | null; // yyyy-mm-dd, null once fully complete
  status: PaceStatus;
  todaysPlan: BacktestItem[];
  nextUp: BacktestItem[];
  completedTodayCount: number;
  daysCompleted: number;
  currentStreak: number;
}

export interface InstrumentProgress {
  instrument: string;
  items: BacktestItem[]; // 6 years, ascending
  completed: number;
  total: number;
  percent: number;
}

export interface DayHistoryEntry {
  date: string; // yyyy-mm-dd
  items: BacktestItem[];
  status: "completed" | "partial" | "missed" | "upcoming";
}
