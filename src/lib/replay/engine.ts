import { indexAtOrBefore } from "./bars";
import { quoteToAccount } from "./instruments";
import { MAX_LOT, MIN_LOT, roundLots } from "./sizing";
import type {
  Bars,
  Command,
  ExitReason,
  InstrumentSpec,
  OrderKind,
  PendingOrder,
  PendingType,
  Position,
  PriceBasis,
  SessionSettings,
  SessionSummary,
  Side,
  Timeframe,
  TradeRecord,
} from "./types";

// ---------------------------------------------------------------------------
// Execution model (documented in docs/replay/EXECUTION.md)
//
//  * Bars are processed one base candle at a time (usually M1) regardless of
//    the chart timeframe.
//  * The replay "cursor" is the last revealed base bar. Market orders and
//    manual closes fill at that bar's CLOSE (the current price), adjusted for
//    spread and adverse slippage.
//  * Orders are only evaluated on bars AFTER the one they were placed on, so
//    nothing can fill on data the trader hadn't seen when deciding.
//  * Longs exit on bid prices, shorts on ask prices. Buy entries fill on ask,
//    sell entries on bid. The stored OHLC basis (bid/ask/mid) determines how
//    the configured spread is applied.
//  * Gaps: if a bar opens beyond a stop, the fill is at the open (plus
//    slippage, clamped to the bar's range). Limits that gap fill at the open.
//  * Same-bar SL and TP: the order of events inside one bar is unknown, so the
//    stop-loss is assumed to fill first (never the favourable outcome). Such
//    exits are flagged `ambiguous`.
//  * On the bar a pending order fills, the stop-loss is checked against the
//    full bar (worst case) and the take-profit is not checked until the next.
// ---------------------------------------------------------------------------

export interface EngineConfig {
  bars: Bars;
  baseTf: Timeframe;
  spec: InstrumentSpec;
  basis: PriceBasis;
  settings: SessionSettings;
  startIndex: number;
  sessionId: string;
}

export interface LedgerEvent {
  t: number;
  kind: "fill" | "exit" | "order" | "cancel" | "modify" | "reject";
  text: string;
  refId?: string;
  amount?: number;
}

export interface EngineState {
  index: number;
  balance: number;
  orders: PendingOrder[];
  positions: Position[];
  trades: TradeRecord[];
  log: LedgerEvent[];
  peakEquity: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  appliedIds: Set<string>;
}

export interface Quote {
  bid: number;
  ask: number;
  spread: number;
}

export type ApplyResult = { ok: true } | { ok: false; error: string };

export interface AdvanceResult {
  fills: number;
  exits: number;
}

const EPS = 1e-9;

function isBuy(t: PendingType | Side): boolean {
  return t === "buy" || t === "buy-limit" || t === "buy-stop";
}

export class ReplayEngine {
  readonly cfg: EngineConfig;
  state: EngineState;

  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
    this.state = this.initialState();
  }

  private initialState(): EngineState {
    const bal = this.cfg.settings.initialBalance;
    return {
      index: this.cfg.startIndex,
      balance: bal,
      orders: [],
      positions: [],
      trades: [],
      log: [],
      peakEquity: bal,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      appliedIds: new Set(),
    };
  }

  // -------------------------------------------------------------------------
  // Prices
  // -------------------------------------------------------------------------

  spreadAt(i: number): number {
    const { settings, spec, bars } = this.cfg;
    if (settings.spreadMode === "recorded" && bars.sp) {
      const s = bars.sp[i];
      if (Number.isFinite(s) && s >= 0) return s;
    }
    return Math.max(0, settings.spreadPips) * spec.pipSize;
  }

  /** Offsets to convert stored prices to bid and ask on bar i. */
  private offsets(i: number): [number, number] {
    const s = this.spreadAt(i);
    switch (this.cfg.basis) {
      case "bid":
        return [0, s];
      case "ask":
        return [-s, 0];
      default:
        return [-s / 2, s / 2];
    }
  }

  quoteAt(i: number = this.state.index): Quote {
    const c = this.cfg.bars.c[i];
    const [ob, oa] = this.offsets(i);
    return { bid: c + ob, ask: c + oa, spread: oa - ob };
  }

  private get slip(): number {
    return Math.max(0, this.cfg.settings.slippagePips) * this.cfg.spec.pipSize;
  }

  private money(distance: number, lots: number, atPrice: number): number {
    const { spec, settings } = this.cfg;
    const conv = quoteToAccount(spec, settings.accountCurrency, atPrice, settings.conversionRate);
    return distance * lots * spec.contractSize * conv.rate;
  }

  get exactConversion(): boolean {
    const { spec, settings } = this.cfg;
    return quoteToAccount(spec, settings.accountCurrency, 1, settings.conversionRate).exact;
  }

  private conversionAvailable(): boolean {
    const { spec, settings } = this.cfg;
    return quoteToAccount(spec, settings.accountCurrency, 1, settings.conversionRate).source !== "missing";
  }

  // -------------------------------------------------------------------------
  // Account
  // -------------------------------------------------------------------------

  unrealized(pos: Position, i: number = this.state.index): number {
    const q = this.quoteAt(i);
    const exit = pos.side === "buy" ? q.bid : q.ask;
    const dir = pos.side === "buy" ? 1 : -1;
    const gross = this.money((exit - pos.entryPrice) * dir, pos.lots, exit);
    const entryCommissionShare = pos.entryCommission * (pos.lots / pos.initialLots);
    return gross - entryCommissionShare;
  }

  equity(i: number = this.state.index): number {
    return this.state.balance + this.state.positions.reduce((s, p) => s + this.unrealized(p, i), 0);
  }

  /** Money lost if every open position hit its current stop (null = no stop). */
  openRisk(): { money: number; unprotected: number } {
    let money = 0;
    let unprotected = 0;
    for (const p of this.state.positions) {
      if (p.sl === null) {
        unprotected++;
        continue;
      }
      const dir = p.side === "buy" ? 1 : -1;
      const loss = -this.money((p.sl - p.entryPrice) * dir, p.lots, p.sl);
      money += Math.max(0, loss);
    }
    return { money, unprotected };
  }

  summary(): SessionSummary {
    const trades = this.state.trades;
    const wins = trades.filter((t) => t.netPnl > 0).length;
    return {
      balance: this.state.balance,
      equity: this.equity(),
      closedTrades: trades.length,
      openPositions: this.state.positions.length,
      netPnl: trades.reduce((s, t) => s + t.netPnl, 0),
      winRate: trades.length ? (wins / trades.length) * 100 : null,
      totalR: trades.reduce((s, t) => s + (t.rMultiple ?? 0), 0),
      rTrades: trades.filter((t) => t.rMultiple !== null).length,
    };
  }

  // -------------------------------------------------------------------------
  // Replay
  // -------------------------------------------------------------------------

  /** Reveal and process bars up to `target` (inclusive). Never moves backward. */
  advanceTo(target: number): AdvanceResult {
    const res: AdvanceResult = { fills: 0, exits: 0 };
    const last = Math.min(target, this.cfg.bars.n - 1);
    for (let i = this.state.index + 1; i <= last; i++) {
      const r = this.processBar(i);
      res.fills += r.fills;
      res.exits += r.exits;
      this.state.index = i;
    }
    return res;
  }

  /** Deterministically rebuild state from commands, then advance to `target`. */
  rebuild(commands: Command[], target: number): { rejected: { cmd: Command; error: string }[] } {
    this.state = this.initialState();
    const rejected: { cmd: Command; error: string }[] = [];
    const ordered = commands
      .map((cmd, order) => ({ cmd, order, idx: indexAtOrBefore(this.cfg.bars, cmd.at) }))
      .sort((a, b) => a.idx - b.idx || a.order - b.order);
    for (const { cmd, idx } of ordered) {
      if (idx > target) break;
      if (idx < this.cfg.startIndex) {
        rejected.push({ cmd, error: "Command precedes the session start." });
        continue;
      }
      this.advanceTo(idx);
      const r = this.apply(cmd);
      if (!r.ok) rejected.push({ cmd, error: r.error });
    }
    this.advanceTo(target);
    return { rejected };
  }

  private processBar(i: number): AdvanceResult {
    const res: AdvanceResult = { fills: 0, exits: 0 };
    const { bars } = this.cfg;
    const [ob, oa] = this.offsets(i);
    const o = bars.o[i];
    const h = bars.h[i];
    const l = bars.l[i];
    const c = bars.c[i];
    const t = bars.t[i];
    const bid = { o: o + ob, h: h + ob, l: l + ob, c: c + ob };
    const ask = { o: o + oa, h: h + oa, l: l + oa, c: c + oa };
    const slip = this.slip;

    // 1) Exits on positions that were open before this bar.
    for (const pos of [...this.state.positions]) {
      if (pos.entryIndex >= i) continue;
      if (this.checkExit(pos, t, bid, ask, slip)) res.exits++;
    }

    // 2) Pending orders placed on earlier bars.
    for (const ord of [...this.state.orders]) {
      const fill = this.checkTrigger(ord, ask, bid, slip);
      if (fill === null) continue;
      this.state.orders = this.state.orders.filter((x) => x.id !== ord.id);
      const pos = this.openPosition({
        id: `p_${ord.id.replace(/^o_/, "")}`,
        side: isBuy(ord.type) ? "buy" : "sell",
        orderType: ord.type,
        lots: ord.lots,
        price: fill,
        index: i,
        t,
        sl: ord.sl,
        tp: ord.tp,
        note: ord.note,
        timeframe: ord.timeframe,
      });
      res.fills++;
      this.log({ t, kind: "fill", text: `${labelOf(ord.type)} ${ord.lots.toFixed(2)} filled @ ${fill}`, refId: pos.id });
      // Worst case on the fill bar: the stop is checked against the whole bar.
      if (pos.sl !== null) {
        const isLong = pos.side === "buy";
        const hit = isLong ? bid.l <= pos.sl : ask.h >= pos.sl;
        if (hit) {
          // If the bar opened beyond the stop, the stop fills at the open.
          const px = isLong
            ? Math.max((bid.o <= pos.sl ? bid.o : pos.sl) - slip, bid.l)
            : Math.min((ask.o >= pos.sl ? ask.o : pos.sl) + slip, ask.h);
          // A limit fill on the way toward the stop makes the stop certain;
          // a stop-entry may have seen the adverse extreme before filling.
          const certain = ord.type === "buy-limit" || ord.type === "sell-limit";
          this.closeLots(pos, pos.lots, sanitize(px, pos.sl), t, "sl", !certain);
          res.exits++;
        }
      }
    }

    // 3) Excursions and mark-to-market drawdown at the bar close.
    for (const pos of this.state.positions) {
      if (pos.entryIndex === i) {
        const exitClose = pos.side === "buy" ? bid.c : ask.c;
        pos.bestPrice = pos.side === "buy" ? Math.max(pos.bestPrice, exitClose) : Math.min(pos.bestPrice, exitClose);
        pos.worstPrice = pos.side === "buy" ? Math.min(pos.worstPrice, exitClose) : Math.max(pos.worstPrice, exitClose);
      } else if (pos.side === "buy") {
        pos.bestPrice = Math.max(pos.bestPrice, bid.h);
        pos.worstPrice = Math.min(pos.worstPrice, bid.l);
      } else {
        pos.bestPrice = Math.min(pos.bestPrice, ask.l);
        pos.worstPrice = Math.max(pos.worstPrice, ask.h);
      }
    }
    if (this.state.positions.length || res.exits) {
      const eq = this.equity(i);
      if (eq > this.state.peakEquity) this.state.peakEquity = eq;
      const dd = this.state.peakEquity - eq;
      if (dd > this.state.maxDrawdown) this.state.maxDrawdown = dd;
      const pct = this.state.peakEquity > 0 ? (dd / this.state.peakEquity) * 100 : 0;
      if (pct > this.state.maxDrawdownPct) this.state.maxDrawdownPct = pct;
    } else if (this.state.balance > this.state.peakEquity) {
      this.state.peakEquity = this.state.balance;
    }
    return res;
  }

  private checkExit(
    pos: Position,
    t: number,
    bid: { o: number; h: number; l: number; c: number },
    ask: { o: number; h: number; l: number; c: number },
    slip: number,
  ): boolean {
    const { sl, tp } = pos;
    if (pos.side === "buy") {
      if (sl !== null && bid.o <= sl) {
        this.closeLots(pos, pos.lots, Math.max(bid.o - slip, bid.l), t, "sl", false);
        return true;
      }
      if (tp !== null && bid.o >= tp) {
        this.closeLots(pos, pos.lots, bid.o, t, "tp", false);
        return true;
      }
      const slHit = sl !== null && bid.l <= sl;
      const tpHit = tp !== null && bid.h >= tp;
      if (slHit) {
        this.closeLots(pos, pos.lots, Math.max(sl! - slip, bid.l), t, "sl", tpHit);
        return true;
      }
      if (tpHit) {
        this.closeLots(pos, pos.lots, tp!, t, "tp", false);
        return true;
      }
    } else {
      if (sl !== null && ask.o >= sl) {
        this.closeLots(pos, pos.lots, Math.min(ask.o + slip, ask.h), t, "sl", false);
        return true;
      }
      if (tp !== null && ask.o <= tp) {
        this.closeLots(pos, pos.lots, ask.o, t, "tp", false);
        return true;
      }
      const slHit = sl !== null && ask.h >= sl;
      const tpHit = tp !== null && ask.l <= tp;
      if (slHit) {
        this.closeLots(pos, pos.lots, Math.min(sl! + slip, ask.h), t, "sl", tpHit);
        return true;
      }
      if (tpHit) {
        this.closeLots(pos, pos.lots, tp!, t, "tp", false);
        return true;
      }
    }
    return false;
  }

  /** Fill price for a pending order on this bar, or null. */
  private checkTrigger(
    ord: PendingOrder,
    ask: { o: number; h: number; l: number },
    bid: { o: number; h: number; l: number },
    slip: number,
  ): number | null {
    const p = ord.price;
    switch (ord.type) {
      case "buy-limit":
        if (ask.o <= p) return ask.o;
        if (ask.l <= p) return p;
        return null;
      case "buy-stop":
        if (ask.o >= p) return Math.min(ask.o + slip, ask.h);
        if (ask.h >= p) return Math.min(p + slip, ask.h);
        return null;
      case "sell-limit":
        if (bid.o >= p) return bid.o;
        if (bid.h >= p) return p;
        return null;
      case "sell-stop":
        if (bid.o <= p) return Math.max(bid.o - slip, bid.l);
        if (bid.l <= p) return Math.max(p - slip, bid.l);
        return null;
    }
  }

  private openPosition(a: {
    id: string;
    side: Side;
    orderType: OrderKind;
    lots: number;
    price: number;
    index: number;
    t: number;
    sl: number | null;
    tp: number | null;
    note?: string;
    timeframe: Timeframe;
  }): Position {
    const initialRisk = a.sl !== null ? this.money(Math.abs(a.price - a.sl), a.lots, a.sl) : null;
    const pos: Position = {
      id: a.id,
      side: a.side,
      orderType: a.orderType,
      lots: a.lots,
      initialLots: a.lots,
      entryPrice: a.price,
      entryT: a.t,
      entryIndex: a.index,
      sl: a.sl,
      tp: a.tp,
      initialSl: a.sl,
      initialTp: a.tp,
      initialRisk: initialRisk !== null && initialRisk > 0 ? initialRisk : null,
      entryCommission: (a.lots * this.cfg.settings.commissionPerLot) / 2,
      exits: [],
      bestPrice: a.price,
      worstPrice: a.price,
      spreadAtEntry: this.spreadAt(a.index),
      note: a.note,
      timeframe: a.timeframe,
    };
    this.state.positions.push(pos);
    return pos;
  }

  private closeLots(pos: Position, lots: number, price: number, t: number, reason: ExitReason, ambiguous: boolean) {
    const closeLots = Math.min(lots, pos.lots);
    const dir = pos.side === "buy" ? 1 : -1;
    const gross = this.money((price - pos.entryPrice) * dir, closeLots, price);
    const commission = (closeLots * this.cfg.settings.commissionPerLot) / 2 + pos.entryCommission * (closeLots / pos.initialLots);
    const net = gross - commission;
    this.state.balance += net;
    pos.exits.push({ t, lots: closeLots, price, reason, gross, commission, net, ambiguous });
    pos.lots = Math.round((pos.lots - closeLots) * 100) / 100;
    this.log({
      t,
      kind: "exit",
      text: `${pos.side === "buy" ? "Long" : "Short"} ${closeLots.toFixed(2)} closed @ ${price} (${reason.toUpperCase()}${ambiguous ? ", same-bar SL/TP — stop assumed first" : ""})`,
      refId: pos.id,
      amount: net,
    });
    if (pos.lots <= EPS) {
      this.state.positions = this.state.positions.filter((p) => p.id !== pos.id);
      this.state.trades.push(this.toTrade(pos));
    }
  }

  private toTrade(pos: Position): TradeRecord {
    const exits = pos.exits;
    const lotsOut = exits.reduce((s, e) => s + e.lots, 0);
    const grossPnl = exits.reduce((s, e) => s + e.gross, 0);
    const commission = exits.reduce((s, e) => s + e.commission, 0);
    const netPnl = exits.reduce((s, e) => s + e.net, 0);
    const exitPrice = lotsOut ? exits.reduce((s, e) => s + e.price * e.lots, 0) / lotsOut : NaN;
    const dir = pos.side === "buy" ? 1 : -1;
    const last = exits[exits.length - 1];
    const pips = exits.reduce((s, e) => s + ((e.price - pos.entryPrice) * dir * e.lots) / pos.initialLots, 0) / this.cfg.spec.pipSize;
    return {
      id: pos.id,
      sessionId: this.cfg.sessionId,
      symbol: this.cfg.spec.symbol,
      side: pos.side,
      orderType: pos.orderType,
      timeframe: pos.timeframe,
      lots: pos.initialLots,
      entryT: pos.entryT,
      entryPrice: pos.entryPrice,
      exitT: last.t,
      exitPrice,
      exitReason: last.reason === "partial" ? "manual" : last.reason,
      initialSl: pos.initialSl,
      initialTp: pos.initialTp,
      finalSl: pos.sl,
      initialRisk: pos.initialRisk,
      grossPnl,
      commission,
      netPnl,
      rMultiple: pos.initialRisk !== null && pos.initialRisk > 0 ? netPnl / pos.initialRisk : null,
      pips,
      holdingSeconds: last.t - pos.entryT,
      exits: exits.slice(),
      mae: Math.max(0, pos.side === "buy" ? pos.entryPrice - pos.worstPrice : pos.worstPrice - pos.entryPrice),
      mfe: Math.max(0, pos.side === "buy" ? pos.bestPrice - pos.entryPrice : pos.entryPrice - pos.bestPrice),
      ambiguous: exits.some((e) => e.ambiguous),
      exactConversion: this.exactConversion,
      spreadAtEntry: pos.spreadAtEntry,
      note: pos.note,
    };
  }

  private log(e: LedgerEvent) {
    this.state.log.push(e);
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  /** Validate and apply a command at the current replay point. */
  apply(cmd: Command): ApplyResult {
    if (this.state.appliedIds.has(cmd.id)) return { ok: false, error: "This order was already submitted." };
    const r = this.applyInner(cmd);
    const t = this.cfg.bars.t[this.state.index];
    if (r.ok) this.state.appliedIds.add(cmd.id);
    else this.log({ t, kind: "reject", text: r.error });
    return r;
  }

  private applyInner(cmd: Command): ApplyResult {
    const i = this.state.index;
    const t = this.cfg.bars.t[i];
    const q = this.quoteAt(i);
    const slip = this.slip;
    switch (cmd.type) {
      case "market": {
        if (!this.conversionAvailable()) return { ok: false, error: "Set a conversion rate for this instrument first." };
        const lots = roundLots(cmd.lots);
        if (lots < MIN_LOT || lots > MAX_LOT) return { ok: false, error: `Size must be between ${MIN_LOT} and ${MAX_LOT} lots.` };
        const buy = cmd.side === "buy";
        const err = validateStops(buy, buy ? q.bid : q.ask, cmd.sl, cmd.tp, "current price");
        if (err) return { ok: false, error: err };
        const fill = buy ? q.ask + slip : q.bid - slip;
        const pos = this.openPosition({
          id: `p_${cmd.id}`,
          side: cmd.side,
          orderType: "market",
          lots,
          price: fill,
          index: i,
          t,
          sl: cmd.sl,
          tp: cmd.tp,
          note: cmd.note,
          timeframe: cmd.timeframe,
        });
        this.log({ t, kind: "fill", text: `Market ${buy ? "buy" : "sell"} ${lots.toFixed(2)} filled @ ${fill}`, refId: pos.id });
        return { ok: true };
      }
      case "pending": {
        if (!this.conversionAvailable()) return { ok: false, error: "Set a conversion rate for this instrument first." };
        const lots = roundLots(cmd.lots);
        if (lots < MIN_LOT || lots > MAX_LOT) return { ok: false, error: `Size must be between ${MIN_LOT} and ${MAX_LOT} lots.` };
        const err = validatePendingPrice(cmd.orderType, cmd.price, q) ?? validateStops(isBuy(cmd.orderType), cmd.price, cmd.sl, cmd.tp, "order price");
        if (err) return { ok: false, error: err };
        const ord: PendingOrder = {
          id: `o_${cmd.id}`,
          type: cmd.orderType,
          price: cmd.price,
          lots,
          sl: cmd.sl,
          tp: cmd.tp,
          createdAt: t,
          note: cmd.note,
          timeframe: cmd.timeframe,
        };
        this.state.orders.push(ord);
        this.log({ t, kind: "order", text: `${labelOf(cmd.orderType)} ${lots.toFixed(2)} @ ${cmd.price} placed`, refId: ord.id });
        return { ok: true };
      }
      case "cancel": {
        const ord = this.state.orders.find((o) => o.id === cmd.orderId);
        if (!ord) return { ok: false, error: "Order not found (it may have filled)." };
        this.state.orders = this.state.orders.filter((o) => o.id !== cmd.orderId);
        this.log({ t, kind: "cancel", text: `${labelOf(ord.type)} cancelled`, refId: ord.id });
        return { ok: true };
      }
      case "modify-order": {
        const ord = this.state.orders.find((o) => o.id === cmd.orderId);
        if (!ord) return { ok: false, error: "Order not found (it may have filled)." };
        const next = {
          price: cmd.price ?? ord.price,
          sl: cmd.sl !== undefined ? cmd.sl : ord.sl,
          tp: cmd.tp !== undefined ? cmd.tp : ord.tp,
        };
        const err = validatePendingPrice(ord.type, next.price, q) ?? validateStops(isBuy(ord.type), next.price, next.sl, next.tp, "order price");
        if (err) return { ok: false, error: err };
        Object.assign(ord, next);
        this.log({ t, kind: "modify", text: `${labelOf(ord.type)} modified`, refId: ord.id });
        return { ok: true };
      }
      case "modify-position": {
        const pos = this.state.positions.find((p) => p.id === cmd.positionId);
        if (!pos) return { ok: false, error: "Position not found (it may have closed)." };
        const buy = pos.side === "buy";
        const sl = cmd.sl !== undefined ? cmd.sl : pos.sl;
        const tp = cmd.tp !== undefined ? cmd.tp : pos.tp;
        const err = validateStops(buy, buy ? q.bid : q.ask, sl, tp, "current price");
        if (err) return { ok: false, error: err };
        pos.sl = sl;
        pos.tp = tp;
        this.log({ t, kind: "modify", text: `SL ${sl ?? "—"} / TP ${tp ?? "—"}`, refId: pos.id });
        return { ok: true };
      }
      case "close": {
        const pos = this.state.positions.find((p) => p.id === cmd.positionId);
        if (!pos) return { ok: false, error: "Position not found (it may have closed)." };
        let lots = cmd.lots === undefined ? pos.lots : roundLots(cmd.lots);
        if (lots <= 0) return { ok: false, error: "Close size must be positive." };
        if (lots > pos.lots) lots = pos.lots;
        if (pos.lots - lots < MIN_LOT - EPS) lots = pos.lots; // can't leave a dust position
        const buy = pos.side === "buy";
        const price = buy ? q.bid - slip : q.ask + slip;
        this.closeLots(pos, lots, price, t, lots < pos.lots ? "partial" : "manual", false);
        return { ok: true };
      }
    }
  }
}

function sanitize(px: number, fallback: number): number {
  return Number.isFinite(px) ? px : fallback;
}

export function labelOf(t: OrderKind): string {
  switch (t) {
    case "market":
      return "Market";
    case "buy-limit":
      return "Buy limit";
    case "sell-limit":
      return "Sell limit";
    case "buy-stop":
      return "Buy stop";
    case "sell-stop":
      return "Sell stop";
  }
}

/** A long's SL must be below and TP above `ref`; mirrored for shorts. */
export function validateStops(buy: boolean, ref: number, sl: number | null, tp: number | null, refLabel: string): string | null {
  if (sl !== null && (!Number.isFinite(sl) || sl <= 0)) return "Stop-loss must be a positive price.";
  if (tp !== null && (!Number.isFinite(tp) || tp <= 0)) return "Take-profit must be a positive price.";
  if (buy) {
    if (sl !== null && sl >= ref) return `Stop-loss must be below the ${refLabel} for a long.`;
    if (tp !== null && tp <= ref) return `Take-profit must be above the ${refLabel} for a long.`;
  } else {
    if (sl !== null && sl <= ref) return `Stop-loss must be above the ${refLabel} for a short.`;
    if (tp !== null && tp >= ref) return `Take-profit must be below the ${refLabel} for a short.`;
  }
  return null;
}

export function validatePendingPrice(type: PendingType, price: number, q: Quote): string | null {
  if (!Number.isFinite(price) || price <= 0) return "Order price must be a positive number.";
  switch (type) {
    case "buy-limit":
      return price < q.ask ? null : "A buy limit must be below the current ask.";
    case "buy-stop":
      return price > q.ask ? null : "A buy stop must be above the current ask.";
    case "sell-limit":
      return price > q.bid ? null : "A sell limit must be above the current bid.";
    case "sell-stop":
      return price < q.bid ? null : "A sell stop must be below the current bid.";
  }
}
