import type { Direction } from "@/lib/types";

// Shape returned by the API (dates serialized to ISO strings). Deliberately
// separate from src/lib/types.ts's Trade/Account — Testing sessions are an
// isolated backtesting workspace, not part of the live journal.
export interface Session {
  id: string;
  name: string;
  pair: string;
  currency: string;
  startingBalance: number;
  strategy: string | null;
  tags: string[];
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  // Optional aggregates the API may include.
  tradeCount?: number;
  netPnl?: number;
  balance?: number;
  winRate?: number;
}

export interface SessionInput {
  name: string;
  pair: string;
  currency: string;
  startingBalance: number;
  strategy?: string | null;
  tags?: string[];
  notes?: string | null;
}

export interface BacktestTrade {
  id: string;
  sessionId: string;
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
  tags: string[];
  comment: string | null;
  chartUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BacktestTradeInput {
  sessionId: string;
  openDate: string;
  closeDate?: string | null;
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
  tags?: string[];
  comment?: string | null;
  chartUrl?: string | null;
}

export type TradeStatus = "ALL" | "OPEN" | "CLOSED";
export type Outcome = "WIN" | "LOSS" | "BREAKEVEN";

export interface TestingFilters {
  status: TradeStatus;
  sessionIds: string[];
  assets: string[];
  sides: Direction[];
  outcomes: Outcome[];
  tags: string[];
  strategies: string[];
  weekdays: number[]; // 0 = Sunday .. 6 = Saturday
  timeFrom: string; // "HH:mm"
  timeTo: string; // "HH:mm"
  timezone: string; // IANA zone, e.g. "Etc/UTC"
  dateFrom: string; // yyyy-mm-dd
  dateTo: string; // yyyy-mm-dd
  breakevenThreshold: number;
}

export const TIMEZONES = [
  "Etc/UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function defaultFilters(): TestingFilters {
  return {
    status: "ALL",
    sessionIds: [],
    assets: [],
    sides: [],
    outcomes: [],
    tags: [],
    strategies: [],
    weekdays: [],
    timeFrom: "00:00",
    timeTo: "23:59",
    timezone: "Etc/UTC",
    dateFrom: "",
    dateTo: "",
    breakevenThreshold: 0,
  };
}
