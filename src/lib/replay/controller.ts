"use client";

import { aggregate, endOfCandle, startOfCandle, type ChartBar } from "./aggregate";
import { indexAtOrBefore } from "./bars";
import { CONTEXT_TF, historyPlan, showsContext, withContext } from "./history";
import { ReplayEngine, type ApplyResult, type LedgerEvent, type Quote } from "./engine";
import { resolveInstrument } from "./instruments";
import { datasetChangedInRange, pruneJournal, resetSession, rewindImpact, truncateCommands } from "./session";
import { ApiError, getDataset, loadBars, newId, pruneJournalEntries, saveJournalEntry, saveSession } from "./storage/repo";
import { bucketKey, TF_SECONDS } from "./time";
import type {
  Bars,
  Command,
  DatasetMeta,
  Drawing,
  IndicatorConfig,
  InstrumentSpec,
  JournalEntry,
  PendingOrder,
  Position,
  ReplaySession,
  SessionSettings,
  Timeframe,
  TradeRecord,
} from "./types";

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewCommand = DistOmit<Command, "id" | "at">;

export const SPEEDS = [1, 2, 5, 10, 20] as const;

export interface RewindPlan {
  targetIndex: number;
  targetT: number;
  droppedCommands: Command[];
  affectedTrades: TradeRecord[];
}

export type SaveState = "saved" | "dirty" | "saving" | "error";

export interface ControllerSnapshot {
  version: number;
  session: ReplaySession;
  dataset: DatasetMeta;
  spec: InstrumentSpec;
  index: number;
  startIndex: number;
  endIndex: number;
  /** Open time of the last revealed base candle. */
  cursorT: number;
  /** Market time at the replay point (close of the last revealed candle). */
  nowT: number;
  quote: Quote;
  positions: Position[];
  /** Per open position: unrealised P&L (after entry commission) and open R incl. partials. */
  positionPnl: Record<string, { unrealized: number; openR: number | null }>;
  orders: PendingOrder[];
  trades: TradeRecord[];
  log: LedgerEvent[];
  balance: number;
  equity: number;
  unrealized: number;
  openRisk: number;
  unprotected: number;
  dailyPnl: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  playing: boolean;
  speed: number;
  atEnd: boolean;
  saveState: SaveState;
  saveError: string | null;
  exactConversion: boolean;
  /** Bumped whenever the chart must be fully redrawn (rewind, timeframe change). */
  chartEpoch: number;
  warnings: string[];
  /** Older history loaded as hourly candles (shown on 1h and above), or null. */
  context: { fromT: number; toT: number; bars: number } | null;
}

/**
 * Owns one replay session: candles, engine, playback and persistence.
 * React reads it through `subscribe` / `getSnapshot` (useSyncExternalStore).
 */
export class ReplayController {
  readonly bars: Bars;
  /** Hourly candles of the older history (chart only — never traded on). */
  readonly context: Bars | null;
  readonly dataset: DatasetMeta;
  readonly spec: InstrumentSpec;
  readonly startIndex: number;
  readonly endIndex: number;
  /** Seconds per base candle. */
  readonly baseSec: number;
  session: ReplaySession;
  engine: ReplayEngine;

  private listeners = new Set<() => void>();
  private version = 0;
  private snapshot!: ControllerSnapshot;
  private timer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private playing = false;
  private speed = 1;
  private saveState: SaveState = "saved";
  private saving: Promise<void> = Promise.resolve();
  private conflict = false;
  private pendingPrune = false;
  private saveError: string | null = null;
  private warnings: string[];
  private chart: { tf: Timeframe; upto: number; bars: ChartBar[]; reset: boolean } | null = null;
  private contextCandles = new Map<string, ChartBar[]>();
  /** Closed trades are append-only: reuse the snapshot's array until one is added (keeps memoised stats cheap while playing). */
  private tradesView: { src: TradeRecord[]; n: number; out: TradeRecord[] } | null = null;
  private chartEpoch = 0;
  private disposed = false;

  private constructor(session: ReplaySession, dataset: DatasetMeta, bars: Bars, spec: InstrumentSpec, warnings: string[], context: Bars | null = null) {
    this.session = session;
    this.dataset = dataset;
    this.bars = bars;
    this.context = context && context.n ? context : null;
    this.spec = spec;
    this.warnings = warnings;
    this.baseSec = TF_SECONDS[dataset.timeframe];
    // Market time T reveals every base candle that has CLOSED by T.
    this.startIndex = Math.max(0, indexAtOrBefore(bars, session.startT - this.baseSec));
    this.endIndex = Math.max(this.startIndex, indexAtOrBefore(bars, session.endT));
    this.engine = new ReplayEngine({
      bars,
      baseTf: dataset.timeframe,
      spec,
      basis: dataset.priceBasis,
      settings: { ...session.settings },
      startIndex: this.startIndex,
      sessionId: session.id,
    });
    const cursor = Math.min(this.endIndex, Math.max(this.startIndex, indexAtOrBefore(bars, session.cursorT - this.baseSec)));
    const { rejected } = this.engine.rebuild(session.commands, cursor);
    if (rejected.length) this.warnings.push(`${rejected.length} recorded action(s) could not be re-applied to the current data and were skipped.`);
    if (session.ledger.length && JSON.stringify(session.ledger) !== JSON.stringify(this.engine.state.trades)) {
      this.warnings.push("Recomputing this session from its recorded actions produced a different ledger than the saved one (the data or engine changed). The recomputed results are shown.");
    }
    this.syncSession();
    this.emit(true);
  }

  /** `dataset` may be passed when the caller already fetched it (saves a round trip). */
  static async load(session: ReplaySession, onProgress?: (loaded: number, total: number, bars: number) => void, signal?: AbortSignal, preloaded?: DatasetMeta | null): Promise<ReplayController> {
    const dataset = preloaded && preloaded.id === session.datasetId ? preloaded : await getDataset(session.datasetId);
    if (!dataset) throw new Error("This session's dataset was deleted. Re-import the data (same symbol and timeframe) to reopen it.");
    if (dataset.missingCandles) throw new Error("This dataset was restored from a backup without candle data. Re-import the CSV to reopen the session.");
    const spec = resolveInstrument(session.symbol);
    if (!spec) throw new Error(`Unknown instrument ${session.symbol}.`);
    const warnings: string[] = [];
    // Long history: ~3 months of base candles + older hourly candles for the chart.
    const plan = historyPlan(session, dataset.timeframe, session.settings.dayBoundary);
    const contextId = dataset.provider ? `fxcm_${session.symbol}_${CONTEXT_TF}` : dataset.id;
    const [bars, context] = await Promise.all([
      loadBars(dataset.id, plan.fineFromT, session.endT, { onProgress, signal }),
      plan.context
        ? loadBars(contextId, plan.context.fromT, plan.context.toT - 1, { hourly: true, signal }).catch((e) => {
            if (e instanceof DOMException && e.name === "AbortError") throw e;
            warnings.push(`The older history (before ${new Date(plan.context!.toT * 1000).toISOString().slice(0, 10)}) couldn't be loaded: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          })
        : Promise.resolve(null),
    ]);
    if (bars.n === 0) throw new Error("No candles found for this session's date range.");
    const changed = datasetChangedInRange(session, dataset);
    if (changed.length) warnings.push(`Dataset months ${changed.join(", ")} changed since this session was created; results are recomputed on the current data.`);
    return new ReplayController(session, dataset, bars, spec, warnings, context);
  }

  // -------------------------------------------------------------------------
  // External store
  // -------------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  private emit(chartChanged = false) {
    const st = this.engine.state;
    const quote = this.engine.quoteAt();
    const risk = this.engine.openRisk();
    const equity = this.engine.equity();
    const cursorT = this.bars.t[st.index];
    const dayKey = bucketKey(cursorT, "D1", this.session.settings.dayBoundary);
    let dailyPnl = 0;
    const addExit = (t: number, net: number) => {
      if (bucketKey(t, "D1", this.session.settings.dayBoundary) === dayKey) dailyPnl += net;
    };
    for (const tr of st.trades) for (const e of tr.exits) addExit(e.t, e.net);
    for (const p of st.positions) for (const e of p.exits) addExit(e.t, e.net);
    if (chartChanged) {
      this.chart = null;
      this.chartEpoch++;
    }
    this.version++;
    this.snapshot = {
      version: this.version,
      session: this.session,
      dataset: this.dataset,
      spec: this.spec,
      index: st.index,
      startIndex: this.startIndex,
      endIndex: this.endIndex,
      cursorT,
      nowT: cursorT + this.baseSec,
      quote,
      positions: st.positions.map((p) => ({ ...p })),
      positionPnl: Object.fromEntries(
        st.positions.map((p) => {
          const u = this.engine.unrealized(p);
          const realized = p.exits.reduce((a, e) => a + e.net, 0);
          return [p.id, { unrealized: u, openR: p.initialRisk ? (u + realized) / p.initialRisk : null }];
        }),
      ),
      orders: st.orders.map((o) => ({ ...o })),
      trades: this.tradesSnapshot(st.trades),
      log: st.log.slice(-200),
      balance: st.balance,
      equity,
      unrealized: equity - st.balance,
      openRisk: risk.money,
      unprotected: risk.unprotected,
      dailyPnl,
      maxDrawdown: st.maxDrawdown,
      maxDrawdownPct: st.maxDrawdownPct,
      playing: this.playing,
      speed: this.speed,
      atEnd: st.index >= this.endIndex,
      saveState: this.saveState,
      saveError: this.saveError,
      exactConversion: this.engine.exactConversion,
      chartEpoch: this.chartEpoch,
      warnings: this.warnings.slice(),
      context: this.context ? { fromT: this.context.t[0], toT: this.bars.t[0], bars: this.context.n } : null,
    };
    for (const l of this.listeners) l();
  }

  // -------------------------------------------------------------------------
  // Chart data (never reads past the cursor)
  // -------------------------------------------------------------------------

  /**
   * Candles for the chart up to the replay cursor. Forward steps extend the
   * cached array incrementally; backward moves or timeframe changes rebuild it.
   */
  chartBars(): { bars: ChartBar[]; reset: boolean } {
    const tf = this.session.timeframe;
    const upto = this.engine.state.index;
    const boundary = this.session.settings.dayBoundary;
    const c = this.chart;
    if (c && c.tf === tf && c.upto === upto) return { bars: c.bars, reset: c.reset };
    if (c && c.tf === tf && upto > c.upto && c.bars.length && c.bars[c.bars.length - 1].first >= 0) {
      const last = c.bars[c.bars.length - 1];
      const tail = aggregate(this.bars, this.dataset.timeframe, tf, boundary, upto, last.first);
      const next = c.bars.slice(0, -1).concat(tail);
      this.chart = { tf, upto, bars: next, reset: false };
      return { bars: next, reset: false };
    }
    const bars = withContext(this.contextFor(tf, boundary), aggregate(this.bars, this.dataset.timeframe, tf, boundary, upto));
    this.chart = { tf, upto, bars, reset: true };
    return { bars, reset: true };
  }

  private tradesSnapshot(src: TradeRecord[]): TradeRecord[] {
    const v = this.tradesView;
    if (v && v.src === src && v.n === src.length) return v.out;
    const out = src.slice();
    this.tradesView = { src, n: src.length, out };
    return out;
  }

  /** Older history as chart candles (1h and above only); complete candles, no base indices. */
  private contextFor(tf: Timeframe, boundary: SessionSettings["dayBoundary"]): ChartBar[] {
    if (!this.context || !showsContext(tf)) return [];
    const key = `${tf}|${boundary}`;
    let out = this.contextCandles.get(key);
    if (!out) {
      out = aggregate(this.context, CONTEXT_TF, tf, boundary).map((b) => ({ ...b, first: -1, last: -1, forming: false }));
      this.contextCandles.set(key, out);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Replay navigation
  // -------------------------------------------------------------------------

  private moveForwardTo(target: number) {
    const t = Math.min(target, this.endIndex);
    if (t <= this.engine.state.index) return { fills: 0, exits: 0 };
    const res = this.engine.advanceTo(t);
    if (this.engine.state.index >= this.endIndex) {
      this.session.status = "completed";
      this.pause(false);
    }
    this.syncSession();
    this.markDirty();
    this.emit();
    return res;
  }

  /** Reveal through the end of the next chart candle (or finish the forming one). */
  stepForward() {
    const i = this.engine.state.index;
    if (i >= this.endIndex) return { fills: 0, exits: 0 };
    const target = endOfCandle(this.bars, i + 1, this.session.timeframe, this.dataset.timeframe, this.session.settings.dayBoundary);
    return this.moveForwardTo(target);
  }

  /** Reveal one base candle (builds the current chart candle bar by bar). */
  stepBase() {
    return this.moveForwardTo(this.engine.state.index + 1);
  }

  /** Plan a step back to the end of the previous complete chart candle. */
  planStepBack(): RewindPlan | null {
    const i = this.engine.state.index;
    if (i <= this.startIndex) return null;
    const first = startOfCandle(this.bars, i, this.session.timeframe, this.dataset.timeframe, this.session.settings.dayBoundary);
    const target = Math.max(this.startIndex, first - 1);
    return this.planRewind(target);
  }

  planRewind(targetIndex: number): RewindPlan {
    const target = Math.max(this.startIndex, Math.min(targetIndex, this.engine.state.index));
    const targetT = this.bars.t[target];
    const allTrades = [...this.engine.state.trades];
    // Open positions that were entered after the target are also undone.
    const { droppedCommands, affectedTrades } = rewindImpact(this.session.commands, allTrades, targetT);
    return { targetIndex: target, targetT, droppedCommands, affectedTrades };
  }

  /** Apply a rewind: actions after the target are discarded and the state rebuilt deterministically. */
  rewind(plan: RewindPlan) {
    this.pause(false);
    this.session.commands = truncateCommands(this.session.commands, plan.targetT);
    this.engine.rebuild(this.session.commands, plan.targetIndex);
    this.session.status = "active";
    this.session.journal = pruneJournal(
      this.session.journal,
      this.engine.state.trades,
      this.engine.state.positions.map((p) => p.id),
    );
    this.pendingPrune = true;
    this.syncSession();
    this.markDirty();
    this.emit(true);
  }

  /** Back to the first candle with no trades. Callers confirm (and may duplicate) first. */
  reset() {
    this.pause(false);
    this.session = resetSession(this.session);
    this.pendingPrune = true;
    this.engine.rebuild([], this.startIndex);
    this.syncSession();
    this.markDirty();
    this.emit(true);
  }

  /** Index of the last base candle that has closed by market time `t`, clamped to the session. */
  indexForTime(t: number): number {
    return Math.min(this.endIndex, Math.max(this.startIndex, indexAtOrBefore(this.bars, t - this.baseSec)));
  }

  jumpForwardTo(t: number) {
    return this.moveForwardTo(this.indexForTime(t));
  }

  play() {
    if (this.playing || this.engine.state.index >= this.endIndex) return;
    this.playing = true;
    this.restartTimer();
    this.emit();
  }

  pause(emit = true) {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (emit) this.emit();
  }

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(speed: number) {
    this.speed = speed;
    if (this.playing) this.restartTimer();
    this.emit();
  }

  private restartTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      const r = this.stepForward();
      if (this.session.settings.pauseOnFill && (r.fills > 0 || r.exits > 0)) this.pause();
    }, Math.max(40, 1000 / this.speed));
  }

  // -------------------------------------------------------------------------
  // Trading
  // -------------------------------------------------------------------------

  submit(cmd: NewCommand): ApplyResult {
    const full = { ...cmd, id: newId("c"), at: this.bars.t[this.engine.state.index] } as Command;
    const r = this.engine.apply(full);
    if (r.ok) {
      this.session.commands = [...this.session.commands, full];
      if (full.type === "market" || full.type === "pending") {
        const note = full.note?.trim();
        if (note) {
          // Positions are keyed by the command that opened them.
          const id = `p_${full.id}`;
          this.session.journal = { ...this.session.journal, [id]: { ...(this.session.journal[id] ?? {}), preTrade: note } };
        }
      }
      this.syncSession();
      this.markDirty();
    }
    this.emit();
    return r;
  }

  // -------------------------------------------------------------------------
  // Session edits
  // -------------------------------------------------------------------------

  setTimeframe(tf: Timeframe) {
    if (TF_SECONDS[tf] < TF_SECONDS[this.dataset.timeframe]) return;
    this.session = { ...this.session, timeframe: tf };
    this.markDirty();
    this.emit(true);
  }

  /** Settings that don't affect execution can change any time. */
  updatePreferences(patch: Partial<Pick<SessionSettings, "riskMode" | "riskPercent" | "riskMoney" | "fixedLots" | "pauseOnFill" | "riskBase">>) {
    this.session = { ...this.session, settings: { ...this.session.settings, ...patch } };
    this.markDirty();
    this.emit();
  }

  /**
   * Execution settings (costs, balance, conversion, day boundary) change the
   * ledger, so all recorded actions are replayed with the new settings.
   * The UI confirms this explicitly before calling.
   */
  updateExecutionSettings(next: SessionSettings): { rejected: number } {
    this.pause(false);
    const cursor = this.engine.state.index;
    this.session = { ...this.session, settings: { ...next } };
    this.engine = new ReplayEngine({ ...this.engine.cfg, settings: { ...next } });
    const { rejected } = this.engine.rebuild(this.session.commands, cursor);
    this.syncSession();
    this.markDirty();
    this.emit(true);
    return { rejected: rejected.length };
  }

  rename(name: string) {
    this.session = { ...this.session, name };
    this.markDirty();
    this.emit();
  }

  setStrategy(strategy: string) {
    this.session = { ...this.session, strategy };
    this.markDirty();
    this.emit();
  }

  setNotes(notes: string) {
    this.session = { ...this.session, notes };
    this.markDirty();
    this.emit();
  }

  setChartPrefs(patch: NonNullable<ReplaySession["chartPrefs"]>) {
    this.session = { ...this.session, chartPrefs: { ...this.session.chartPrefs, ...patch } };
    this.markDirty();
    this.emit();
  }

  setDrawings(drawings: Drawing[]) {
    this.session = { ...this.session, drawings };
    this.markDirty();
    this.emit();
  }

  setIndicators(indicators: IndicatorConfig[]) {
    this.session = { ...this.session, indicators };
    this.markDirty();
    this.emit();
  }

  setDisplayTimezone(tz: string) {
    this.session = { ...this.session, displayTimezone: tz };
    this.markDirty();
    this.emit();
  }

  /** Journal entries are saved on their own (not part of the session save). */
  setJournal(tradeId: string, entry: JournalEntry) {
    const value = { ...entry, updatedAt: Date.now() };
    this.session = { ...this.session, journal: { ...this.session.journal, [tradeId]: value } };
    this.emit();
    void saveJournalEntry(this.session.id, tradeId, value).catch((e) => {
      this.saveState = "error";
      this.saveError = `Journal not saved: ${e instanceof Error ? e.message : String(e)}`;
      if (!this.disposed) this.emit();
    });
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private syncSession() {
    const st = this.engine.state;
    this.session = {
      ...this.session,
      cursorT: this.bars.t[st.index] + this.baseSec,
      ledger: st.trades.slice(),
      summary: this.engine.summary(),
    };
  }

  private markDirty() {
    this.saveState = "dirty";
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), this.playing ? 2500 : 700);
  }

  async save(): Promise<boolean> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    // Saves are serialised: a second save waits for the first, so two
    // requests never race against the same base revision.
    const run = this.saving.then(() => this.saveNow());
    this.saving = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async saveNow(): Promise<boolean> {
    if (this.conflict) {
      this.saveState = "error";
      if (!this.disposed) this.emit();
      return false;
    }
    this.saveState = "saving";
    if (!this.disposed) this.emit();
    try {
      this.session = { ...this.session, updatedAt: Date.now() };
      const { revision } = await saveSession(this.session);
      this.session = { ...this.session, revision };
      if (this.pendingPrune) {
        const keep = [...this.engine.state.trades.map((t) => t.id), ...this.engine.state.positions.map((p) => p.id)];
        await pruneJournalEntries(this.session.id, keep);
        this.pendingPrune = false;
      }
      this.saveState = "saved";
      this.saveError = null;
      if (!this.disposed) this.emit();
      return true;
    } catch (e) {
      this.saveState = "error";
      if (e instanceof ApiError && e.status === 409) {
        // Never overwrite someone else's newer save; stop autosaving.
        this.conflict = true;
        this.saveError = e.message;
      } else this.saveError = e instanceof Error ? e.message : String(e);
      if (!this.disposed) this.emit();
      return false;
    }
  }


  async dispose() {
    this.pause(false);
    const pending = this.saveState === "dirty" || this.saveState === "error";
    this.disposed = true;
    this.listeners.clear();
    if (pending) await this.save();
  }
}
