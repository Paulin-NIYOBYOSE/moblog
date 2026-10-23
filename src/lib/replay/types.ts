// Domain types for Replay — the local-first historical backtesting module.
// Everything here is plain data so it can be stored in the database, posted to a
// worker, and exported to JSON without transformation.

export type Timeframe = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1" | "W1";

/** Which side of the book the stored OHLC values represent. */
export type PriceBasis = "bid" | "ask" | "mid" | "unknown";

/**
 * Where D1/W1 (and H4) candles start. `ny-close` is the forex convention used
 * by most brokers: the trading day rolls over at 17:00 New York time, so H4/D1
 * candles line up with "GMT+2/+3 server time" charts. `utc` rolls at 00:00 UTC.
 */
export type DayBoundary = "ny-close" | "utc";

/** Columnar candle storage. `t` is the bar OPEN time in unix seconds (UTC). */
export interface Bars {
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  v: Float64Array;
  /** Average bid/ask spread in price units for the bar, NaN when unknown. */
  sp: Float32Array | null;
  n: number;
}

/** Object form of a single candle — used by the chart and tests. */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface InstrumentSpec {
  symbol: string;
  base: string;
  quote: string;
  /** Price increment that traders call one pip (0.0001, 0.01 for JPY, 0.1 for gold). */
  pipSize: number;
  /** Decimal places used to display prices. */
  digits: number;
  /** Units of the base asset per 1.00 lot. */
  contractSize: number;
  kind: "fx" | "metal" | "custom";
  description: string;
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export type SourcePreset =
  | "histdata-ascii"
  | "histdata-ascii-tick"
  | "histdata-mt"
  | "histdata-metastock"
  | "histdata-nt-tick"
  | "dukascopy"
  | "dukascopy-tick"
  | "metatrader"
  | "generic"
  | "fxcm";

export interface GapInfo {
  from: number;
  to: number;
  seconds: number;
}

export interface QualityReport {
  rowsRead: number;
  malformed: number;
  malformedExamples: { line: number; text: string; reason: string }[];
  invalidOhlc: number;
  invalidExamples: { line: number; text: string; reason: string }[];
  duplicates: number;
  conflictingDuplicates: number;
  outOfOrder: number;
  /** Bars whose open time isn't on a timeframe boundary. */
  misaligned: number;
  /** Count of missing intervals excluding the weekly forex closure. */
  gapCount: number;
  largeGaps: GapInfo[];
  weekendGaps: number;
}

export interface MonthChunkInfo {
  month: string; // YYYY-MM (UTC)
  n: number;
  firstT: number;
  lastT: number;
  /** Bumped whenever this month's candles change (append / merge). */
  rev: number;
}

export interface DatasetMeta {
  id: string;
  name: string;
  symbol: string;
  timeframe: Timeframe;
  priceBasis: PriceBasis;
  source: SourcePreset;
  sourceTimezone: string;
  hasSpread: boolean;
  importedAt: number;
  updatedAt: number;
  /** Incremented on every append so sessions can detect changed data. */
  version: number;
  firstT: number;
  lastT: number;
  count: number;
  months: MonthChunkInfo[];
  quality: QualityReport;
  files: { name: string; size: number; importedAt: number; rows: number }[];
  /** Derived from ticks? Then intrabar order inside each M1 is still unknown. */
  derivedFromTicks: boolean;
  /** Restored from a backup that didn't include candle data. */
  missingCandles?: boolean;
  /** Present for datasets downloaded automatically from a provider. */
  provider?: ProviderCoverage;
}

/**
 * ok: the complete trading week. partial: the fullest week any provider has
 * (holiday weeks, or a provider still catching up). missing: no provider has
 * it. empty: an FXCM file without candles, stored before Exness was added.
 */
export type ChunkStatus = "ok" | "partial" | "missing" | "empty";

/** Free archives that automatic history is downloaded from. */
export type ProviderId = "fxcm" | "exness";

export interface ChunkCoverage {
  status: ChunkStatus;
  n: number;
  fetchedAt: number;
  /** Provider whose candles are stored, or null when none had the week. */
  source: ProviderId | null;
  /** Providers asked for this week so far. */
  tried: ProviderId[];
}

/** Which trading weeks are stored in the database, and from which provider. */
export interface ProviderCoverage {
  resolution: Timeframe;
  chunks: Record<string, ChunkCoverage>;
}

export interface MonthChunk {
  key: string; // `${datasetId}|${month}`
  datasetId: string;
  month: string;
  bars: Bars;
}

// ---------------------------------------------------------------------------
// Sessions, orders and the trade ledger
// ---------------------------------------------------------------------------

export type Side = "buy" | "sell";
export type PendingType = "buy-limit" | "sell-limit" | "buy-stop" | "sell-stop";
export type OrderKind = "market" | PendingType;
export type RiskMode = "percent" | "money" | "lots";
export type SpreadMode = "fixed" | "recorded";
export type ExitReason = "sl" | "tp" | "manual" | "partial";

export interface SessionSettings {
  initialBalance: number;
  accountCurrency: string;
  riskMode: RiskMode;
  riskPercent: number;
  riskMoney: number;
  fixedLots: number;
  spreadMode: SpreadMode;
  /** Spread in pips applied when no recorded spread is used. */
  spreadPips: number;
  /** Adverse slippage in pips on market and stop fills. */
  slippagePips: number;
  /** Commission per 1.00 lot, round turn, in account currency. */
  commissionPerLot: number;
  /** 1 unit of quote currency = X account currency. Only for crosses. */
  conversionRate: number | null;
  dayBoundary: DayBoundary;
  pauseOnFill: boolean;
  /** Base for %-risk sizing: the starting balance or the current balance (default). */
  riskBase?: "initial" | "balance";
}

interface CommandBase {
  id: string;
  /** Replay time (open time of the last revealed base bar) when issued. */
  at: number;
}

export interface MarketCommand extends CommandBase {
  type: "market";
  side: Side;
  lots: number;
  sl: number | null;
  tp: number | null;
  note?: string;
  timeframe: Timeframe;
}

export interface PendingCommand extends CommandBase {
  type: "pending";
  orderType: PendingType;
  price: number;
  lots: number;
  sl: number | null;
  tp: number | null;
  note?: string;
  timeframe: Timeframe;
}

export interface CancelCommand extends CommandBase {
  type: "cancel";
  orderId: string;
}

export interface ModifyOrderCommand extends CommandBase {
  type: "modify-order";
  orderId: string;
  price?: number;
  sl?: number | null;
  tp?: number | null;
}

export interface ModifyPositionCommand extends CommandBase {
  type: "modify-position";
  positionId: string;
  sl?: number | null;
  tp?: number | null;
}

export interface CloseCommand extends CommandBase {
  type: "close";
  positionId: string;
  /** Lots to close; omitted = the whole position. */
  lots?: number;
}

export type Command =
  | MarketCommand
  | PendingCommand
  | CancelCommand
  | ModifyOrderCommand
  | ModifyPositionCommand
  | CloseCommand;

export interface PendingOrder {
  id: string;
  type: PendingType;
  price: number;
  lots: number;
  sl: number | null;
  tp: number | null;
  createdAt: number;
  note?: string;
  timeframe: Timeframe;
}

export interface PartialFill {
  t: number;
  lots: number;
  price: number;
  reason: ExitReason;
  gross: number;
  commission: number;
  net: number;
  ambiguous: boolean;
}

export interface Position {
  id: string;
  side: Side;
  orderType: OrderKind;
  lots: number;
  initialLots: number;
  entryPrice: number;
  /** Replay time at which the fill happened (bar close for market fills). */
  entryT: number;
  entryIndex: number;
  sl: number | null;
  tp: number | null;
  initialSl: number | null;
  initialTp: number | null;
  /** Monetary loss at the initial stop for the full initial size, or null. */
  initialRisk: number | null;
  entryCommission: number;
  exits: PartialFill[];
  /** Best and worst prices reached while open (exit side), for MAE/MFE. */
  bestPrice: number;
  worstPrice: number;
  spreadAtEntry: number;
  note?: string;
  timeframe: Timeframe;
}

export interface TradeRecord {
  id: string;
  sessionId: string;
  symbol: string;
  side: Side;
  orderType: OrderKind;
  timeframe: Timeframe;
  lots: number;
  entryT: number;
  entryPrice: number;
  exitT: number;
  /** Lot-weighted average exit price. */
  exitPrice: number;
  exitReason: ExitReason;
  initialSl: number | null;
  initialTp: number | null;
  finalSl: number | null;
  initialRisk: number | null;
  grossPnl: number;
  commission: number;
  netPnl: number;
  rMultiple: number | null;
  pips: number;
  holdingSeconds: number;
  exits: PartialFill[];
  /** Max adverse / favorable excursion in price units. */
  mae: number;
  mfe: number;
  /** True when an exit relied on the conservative same-bar SL/TP rule. */
  ambiguous: boolean;
  /** False when money values used a fixed, user-entered conversion rate. */
  exactConversion: boolean;
  spreadAtEntry: number;
  note?: string;
}

export type DrawingKind =
  | "hline"
  | "vline"
  | "trend"
  | "rect"
  | "ray"
  | "long"
  | "short"
  | "fib"
  | "text"
  | "pricerange"
  | "daterange";

export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: { t: number; p: number }[];
  color: string;
  label?: string;
  /** Text annotations. */
  text?: string;
  width?: 1 | 2 | 3;
  style?: "solid" | "dashed" | "dotted";
  locked?: boolean;
}

export interface IndicatorConfig {
  id: string;
  type: "sma" | "ema" | "bb" | "rsi" | "atr" | "macd";
  period: number;
  /** Secondary params: BB std-dev multiplier, MACD slow/signal. */
  param2?: number;
  param3?: number;
  color: string;
  /** On the chart (added). Defaults that were never added stay `false`. */
  visible: boolean;
  /** Added but temporarily hidden (eye toggle in the legend). */
  hidden?: boolean;
}

export interface JournalEntry {
  strategy?: string;
  setup?: string;
  entryRationale?: string;
  exitRationale?: string;
  context?: string;
  confidence?: number;
  emotion?: string;
  mistakes?: string[];
  lessons?: string;
  notes?: string;
  tags?: string[];
  preTrade?: string;
  postTrade?: string;
  screenshot?: string; // data URL (PNG/JPEG), kept small
  updatedAt?: number;
}

export interface SessionSummary {
  balance: number;
  equity: number;
  closedTrades: number;
  openPositions: number;
  netPnl: number;
  winRate: number | null;
  totalR: number;
  /** Closed trades with a valid R-multiple (had an initial stop). */
  rTrades?: number;
}

/** Where a session's candles come from. */
export interface SessionSource {
  kind: "provider" | "import";
  /** Always "fxcm" (the automatic history family, whichever archive filled each week). */
  provider?: "fxcm";
  resolution?: Timeframe;
}

export interface ReplaySession {
  id: string;
  name: string;
  strategy: string;
  notes: string;
  description?: string;
  tags?: string[];
  favorite?: boolean;
  archived?: boolean;
  source?: SessionSource;
  /** Chart preferences for this session. */
  chartPrefs?: { hideDrawings?: boolean; sessionShading?: boolean; autoScroll?: boolean; lockDrawings?: boolean; magnet?: boolean; pastTrades?: boolean; tradeLabels?: boolean };
  createdAt: number;
  updatedAt: number;
  parentId?: string;
  datasetId: string;
  datasetVersion: number;
  /** Month revs of the dataset at creation — detects changed data in range. */
  datasetMonthRevs: Record<string, number>;
  symbol: string;
  timeframe: Timeframe;
  historyStartT: number;
  startT: number;
  endT: number;
  /** Market time at the replay point: close time of the last revealed base candle. */
  cursorT: number;
  settings: SessionSettings;
  commands: Command[];
  drawings: Drawing[];
  indicators: IndicatorConfig[];
  displayTimezone: string;
  journal: Record<string, JournalEntry>;
  /** Cached ledger (recomputable from commands + data). */
  ledger: TradeRecord[];
  summary: SessionSummary;
  status: "active" | "completed";
  /** Server revision for optimistic concurrency (absent before first save). */
  revision?: number;
  /** In list views commands are omitted; this keeps their count. */
  commandCount?: number;
  /** Data-quality check of the session range, recorded when it was prepared. */
  dataCheck?: { checkedAt: number; bars: number; gapCount: number; largeGaps: { from: number; to: number; seconds: number }[]; weekendGaps: number; missingWeeks: string[] };
}

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  setups: string[];
  tags: string[];
  checklist: string[];
}
