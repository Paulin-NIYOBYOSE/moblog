import { DEFAULT_SPREAD_PIPS, resolveInstrument } from "./instruments";
import { providerDatasetId } from "./providers";
import { newId } from "./storage/repo";
import { formatInTz } from "./time";
import type {
  Command,
  DatasetMeta,
  IndicatorConfig,
  JournalEntry,
  ReplaySession,
  SessionSettings,
  Timeframe,
  TradeRecord,
} from "./types";

export function defaultSettings(ds: Pick<DatasetMeta, "symbol" | "hasSpread">): SessionSettings {
  return {
    initialBalance: 10_000,
    accountCurrency: "USD",
    riskMode: "percent",
    riskPercent: 1,
    riskMoney: 100,
    fixedLots: 0.1,
    spreadMode: ds.hasSpread ? "recorded" : "fixed",
    spreadPips: DEFAULT_SPREAD_PIPS[ds.symbol] ?? 1.5,
    slippagePips: 0,
    commissionPerLot: 0,
    conversionRate: null,
    dayBoundary: "ny-close",
    pauseOnFill: true,
  };
}

export const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: "ema20", type: "ema", period: 20, color: "#2a78d6", visible: false },
  { id: "ema50", type: "ema", period: 50, color: "#eb6834", visible: false },
  { id: "sma200", type: "sma", period: 200, color: "#9085e9", visible: false },
  { id: "bb20", type: "bb", period: 20, param2: 2, color: "#0e7fa3", visible: false },
  { id: "rsi14", type: "rsi", period: 14, color: "#c98500", visible: false },
  { id: "atr14", type: "atr", period: 14, color: "#d55181", visible: false },
  { id: "macd", type: "macd", period: 12, param2: 26, param3: 9, color: "#3987e5", visible: false },
];

export interface NewSessionInput {
  name: string;
  strategy: string;
  dataset: DatasetMeta;
  timeframe: Timeframe;
  startT: number;
  endT: number;
  historyMonths: number;
  settings: SessionSettings;
  displayTimezone: string;
}

export function createSession(input: NewSessionInput): ReplaySession {
  const now = Date.now();
  const historyStartT = Math.max(input.dataset.firstT, input.startT - Math.max(0, input.historyMonths) * 31 * 86_400);
  const monthRevs: Record<string, number> = {};
  for (const m of input.dataset.months) {
    if (m.lastT >= historyStartT && m.firstT <= input.endT) monthRevs[m.month] = m.rev;
  }
  return {
    id: newId("rs_"),
    name: input.name.trim() || `${input.dataset.symbol} ${input.timeframe}`,
    strategy: input.strategy.trim(),
    notes: "",
    createdAt: now,
    updatedAt: now,
    datasetId: input.dataset.id,
    datasetVersion: input.dataset.version,
    datasetMonthRevs: monthRevs,
    symbol: input.dataset.symbol,
    timeframe: input.timeframe,
    historyStartT,
    startT: input.startT,
    endT: input.endT,
    cursorT: input.startT,
    settings: input.settings,
    commands: [],
    drawings: [],
    indicators: DEFAULT_INDICATORS.map((i) => ({ ...i })),
    displayTimezone: input.displayTimezone,
    journal: {},
    ledger: [],
    summary: {
      balance: input.settings.initialBalance,
      equity: input.settings.initialBalance,
      closedTrades: 0,
      openPositions: 0,
      netPnl: 0,
      winRate: null,
      totalR: 0,
    },
    status: "active",
  };
}

export interface ProviderSessionInput {
  name: string;
  strategy: string;
  description?: string;
  tags?: string[];
  symbol: string;
  resolution: Timeframe;
  timeframe: Timeframe;
  /** Start of downloaded history (chart context before the replay start). */
  historyStartT: number;
  startT: number;
  endT: number;
  settings: SessionSettings;
  displayTimezone: string;
}

/**
 * A session whose candles come from the automatic provider. The dataset may
 * not exist yet — the workspace prepares (downloads) it before opening.
 */
export function createProviderSession(input: ProviderSessionInput): ReplaySession {
  const now = Date.now();
  return {
    id: newId("rs_"),
    name: input.name.trim() || `${input.symbol} ${input.timeframe}`,
    strategy: input.strategy.trim(),
    notes: "",
    description: input.description?.trim() || undefined,
    tags: input.tags?.length ? input.tags : undefined,
    source: { kind: "provider", provider: "fxcm", resolution: input.resolution },
    createdAt: now,
    updatedAt: now,
    datasetId: providerDatasetId(input),
    datasetVersion: 0,
    datasetMonthRevs: {},
    symbol: input.symbol,
    timeframe: input.timeframe,
    historyStartT: input.historyStartT,
    startT: input.startT,
    endT: input.endT,
    cursorT: input.startT,
    settings: input.settings,
    commands: [],
    drawings: [],
    indicators: DEFAULT_INDICATORS.map((i) => ({ ...i })),
    displayTimezone: input.displayTimezone,
    journal: {},
    ledger: [],
    summary: {
      balance: input.settings.initialBalance,
      equity: input.settings.initialBalance,
      closedTrades: 0,
      openPositions: 0,
      netPnl: 0,
      winRate: null,
      totalR: 0,
    },
    status: "active",
  };
}

/** Record which dataset version a session was prepared against (before any trades). */
export function pinDataset(s: ReplaySession, ds: DatasetMeta): ReplaySession {
  if (s.commands.length) return s;
  const monthRevs: Record<string, number> = {};
  for (const m of ds.months) if (m.lastT >= s.historyStartT && m.firstT <= s.endT) monthRevs[m.month] = m.rev;
  return { ...s, datasetVersion: ds.version, datasetMonthRevs: monthRevs };
}

/** True when a session has unseen trades/progress worth calling "in progress". */
export function sessionProgress(s: ReplaySession): number {
  const span = Math.max(1, s.endT - s.startT);
  return Math.min(1, Math.max(0, (s.cursorT - s.startT) / span));
}

/** Copy a session — optionally keeping trades — under a new id. */
export function duplicateSession(s: ReplaySession, opts: { name?: string; keepProgress: boolean }): ReplaySession {
  const now = Date.now();
  const copy: ReplaySession = JSON.parse(JSON.stringify(s));
  copy.id = newId("rs_");
  copy.parentId = s.id;
  copy.name = opts.name ?? `${s.name} (copy)`;
  copy.createdAt = now;
  copy.updatedAt = now;
  if (!opts.keepProgress) return resetSession(copy);
  // Trade ids embed command ids; re-key the cached ledger to the new session.
  copy.ledger = copy.ledger.map((t) => ({ ...t, sessionId: copy.id }));
  return copy;
}

export function resetSession(s: ReplaySession): ReplaySession {
  return {
    ...s,
    cursorT: s.startT,
    commands: [],
    journal: {},
    ledger: [],
    status: "active",
    updatedAt: Date.now(),
    summary: {
      balance: s.settings.initialBalance,
      equity: s.settings.initialBalance,
      closedTrades: 0,
      openPositions: 0,
      netPnl: 0,
      winRate: null,
      totalR: 0,
    },
  };
}

/** What stepping back to `targetT` would undo. */
export function rewindImpact(commands: Command[], ledger: TradeRecord[], targetT: number) {
  const droppedCommands = commands.filter((c) => c.at > targetT);
  const affectedTrades = ledger.filter((t) => t.exitT > targetT || t.entryT > targetT);
  return { droppedCommands, affectedTrades };
}

export function truncateCommands(commands: Command[], targetT: number): Command[] {
  return commands.filter((c) => c.at <= targetT);
}

/** Drop journal entries of trades that no longer exist in the ledger. */
export function pruneJournal(journal: Record<string, JournalEntry>, ledger: TradeRecord[], openIds: string[]): Record<string, JournalEntry> {
  const keep = new Set([...ledger.map((t) => t.id), ...openIds]);
  return Object.fromEntries(Object.entries(journal).filter(([id]) => keep.has(id)));
}

export function datasetChangedInRange(s: ReplaySession, ds: DatasetMeta): string[] {
  const changed: string[] = [];
  for (const [month, rev] of Object.entries(s.datasetMonthRevs)) {
    const m = ds.months.find((x) => x.month === month);
    if (!m || m.rev !== rev) changed.push(month);
  }
  return changed;
}

export function instrumentFor(s: Pick<ReplaySession, "symbol">) {
  return resolveInstrument(s.symbol);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface ExportRow {
  trade: TradeRecord;
  journal?: JournalEntry;
  sessionName: string;
  strategy: string;
}

/** Prices without floating-point noise (fills include averaged spreads). */
const px = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "" : String(+v.toFixed(6)));

export function tradesToCsv(rows: ExportRow[], tz = "UTC"): string {
  const header = [
    "session", "trade_id", "symbol", "direction", "order_type", "timeframe", "lots",
    "entry_time", "entry_price", "exit_time", "exit_price", "exit_reason",
    "initial_sl", "initial_tp", "final_sl", "initial_risk", "gross_pnl", "commission", "net_pnl",
    "r_multiple", "pips", "holding_minutes", "mae", "mfe", "ambiguous_exit", "exact_conversion",
    "strategy", "setup", "tags", "confidence", "emotion", "mistakes", "entry_rationale", "exit_rationale",
    "context", "lessons", "notes",
  ];
  const lines = [header.join(",")];
  for (const { trade: t, journal: j = {}, sessionName, strategy } of rows) {
    lines.push(
      [
        sessionName, t.id, t.symbol, t.side === "buy" ? "long" : "short", t.orderType, t.timeframe, t.lots,
        formatInTz(t.entryT, tz, "datetime"), px(t.entryPrice), formatInTz(t.exitT, tz, "datetime"), px(t.exitPrice), t.exitReason,
        px(t.initialSl), px(t.initialTp), px(t.finalSl), t.initialRisk?.toFixed(2), t.grossPnl.toFixed(2), t.commission.toFixed(2), t.netPnl.toFixed(2),
        t.rMultiple?.toFixed(3), t.pips.toFixed(1), (t.holdingSeconds / 60).toFixed(0), px(t.mae), px(t.mfe), t.ambiguous, t.exactConversion,
        j.strategy || strategy, j.setup, (j.tags ?? []).join("|"), j.confidence, j.emotion, (j.mistakes ?? []).join("|"),
        j.entryRationale, j.exitRationale, j.context, j.lessons, j.notes ?? t.note,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
