export type Direction = "LONG" | "SHORT";

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

// A trade with its running account balance attached (after the trade closed).
export interface TradeWithBalance extends Trade {
  balance: number;
}
