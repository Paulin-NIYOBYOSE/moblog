// MT5 auto-sync — turns the deals the MoblogSync expert advisor posts into
// journal trades. MT5 records executions as deals; every deal carries the id
// of the position it opened or closed, so one position (its entry deals plus
// any partial/full exits) becomes one Trade. Pure functions only — the
// database side lives in ./server.ts.

import type { Direction } from "@/lib/types";

export type DealSide = "buy" | "sell";
export type DealEntry = "in" | "out" | "inout" | "out_by";
export type DealReason = "manual" | "expert" | "sl" | "tp" | "so" | "other";

export interface Mt5Deal {
  ticket: string;
  position: string;
  /** Trade-server clock, seconds since epoch (MT5 datetimes aren't UTC). */
  time: number;
  side: DealSide;
  entry: DealEntry;
  symbol: string;
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  fee: number;
  sl: number | null;
  tp: number | null;
  reason: DealReason;
  /** Entry deals with a stop: account-currency loss if the stop is hit. */
  risk: number | null;
}

export interface Mt5Payload {
  login: string;
  server: string;
  /** Seconds the trade server's clock runs ahead of UTC. */
  serverUtcOffset: number;
  deals: Mt5Deal[];
}

/** One MT5 position, in the Trade table's terms. */
export interface Mt5Position {
  ticket: string;
  pair: string;
  direction: Direction;
  openDate: Date;
  closeDate: Date | null;
  entry: number;
  exit: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  size: number;
  pnl: number;
  riskAmount: number | null;
  rr: number | null;
  exitLogic: string | null;
}

/** Upper bound per request; the EA sends 100 positions at a time. */
export const MAX_DEALS = 5000;

const SIDES: readonly string[] = ["buy", "sell"];
const ENTRIES: readonly string[] = ["in", "out", "inout", "out_by"];
const REASONS: readonly string[] = ["manual", "expert", "sl", "tp", "so", "other"];

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A stop/target/risk of 0 means "none" in MT5. */
function positiveOrNull(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

function ticketString(value: unknown): string | null {
  const s = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  return /^\d{1,20}$/.test(s) ? s : null;
}

/** Validate a sync request body. */
export function parseMt5Payload(body: unknown): { payload: Mt5Payload } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Expected a JSON object." };
  const b = body as Record<string, unknown>;

  const login = ticketString(b.login);
  if (!login) return { error: "Missing MT5 login." };
  const server = typeof b.server === "string" ? b.server.trim().slice(0, 120) : "";
  const offset = num(b.serverUtcOffset) ?? 0;
  if (Math.abs(offset) > 14 * 3600) return { error: "serverUtcOffset is out of range." };
  if (!Array.isArray(b.deals)) return { error: "deals must be an array." };
  if (b.deals.length > MAX_DEALS) return { error: `Send at most ${MAX_DEALS} deals per request.` };

  const deals: Mt5Deal[] = [];
  for (const [i, raw] of b.deals.entries()) {
    const d = (raw ?? {}) as Record<string, unknown>;
    const ticket = ticketString(d.ticket);
    const position = ticketString(d.position);
    const time = num(d.time);
    const symbol = typeof d.symbol === "string" ? d.symbol.trim() : "";
    const volume = num(d.volume);
    const price = num(d.price);
    if (!ticket || !position || time === null || !symbol || volume === null || volume <= 0 || price === null) {
      return { error: `Deal #${i + 1} is missing ticket, position, time, symbol, volume or price.` };
    }
    if (!SIDES.includes(String(d.side)) || !ENTRIES.includes(String(d.entry))) {
      return { error: `Deal #${i + 1} has an unknown side or entry.` };
    }
    deals.push({
      ticket,
      position,
      time,
      side: d.side as DealSide,
      entry: d.entry as DealEntry,
      symbol: symbol.slice(0, 40),
      volume,
      price,
      profit: num(d.profit) ?? 0,
      commission: num(d.commission) ?? 0,
      swap: num(d.swap) ?? 0,
      fee: num(d.fee) ?? 0,
      sl: positiveOrNull(d.sl),
      tp: positiveOrNull(d.tp),
      reason: REASONS.includes(String(d.reason)) ? (d.reason as DealReason) : "other",
      risk: positiveOrNull(d.risk),
    });
  }
  return { payload: { login, server, serverUtcOffset: offset, deals } };
}

/**
 * Broker symbol → journal pair: drops the account-type suffixes brokers bolt
 * on ("EURUSD.raw", "XAUUSD+", "GBPUSD-ECN", Exness' "EURUSDm").
 */
export function normalizePair(symbol: string): string {
  let s = symbol.trim();
  const sep = s.search(/[.\-_+#!]/);
  if (sep >= 3) s = s.slice(0, sep);
  const lower = s.match(/^([A-Z0-9]{3,})[a-z]{1,4}$/);
  if (lower) s = lower[1];
  return s.toUpperCase();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function compareTickets(a: string, b: string) {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

function vwap(deals: Mt5Deal[]): number {
  const volume = deals.reduce((s, d) => s + d.volume, 0);
  return deals.reduce((s, d) => s + d.price * d.volume, 0) / volume;
}

/** Exit label from the final exit deal (its reason and price). */
function exitLogicFor(reason: DealReason, entry: number, lastExitPrice: number): string | null {
  switch (reason) {
    case "sl":
      // A stop that was trailed to entry.
      return Math.abs(lastExitPrice - entry) <= entry * 2e-5 ? "Break-even" : "Stop loss";
    case "tp":
      return "Full TP";
    case "so":
      return "Stop out";
    case "manual":
      return "Manual close";
    case "expert":
      return "Closed by EA";
    default:
      return null;
  }
}

/**
 * Group deals by position and build one trade per position. A position is
 * closed once its exits cover the volume it opened with; until then it is an
 * open trade carrying the P&L realized so far (partial closes, fees).
 * Positions whose opening deal isn't in the batch are skipped — the EA always
 * sends every deal of each position it includes.
 *
 * Netting accounts: a reversal deal ("inout") is treated as the position's
 * exit; the reversed remainder isn't tracked separately.
 */
export function buildPositions(payload: Mt5Payload): Mt5Position[] {
  const byPosition = new Map<string, Mt5Deal[]>();
  for (const deal of payload.deals) {
    const list = byPosition.get(deal.position);
    if (list) list.push(deal);
    else byPosition.set(deal.position, [deal]);
  }

  const toDate = (serverTime: number) => new Date((serverTime - payload.serverUtcOffset) * 1000);
  const positions: Mt5Position[] = [];

  for (const [ticket, all] of byPosition) {
    // The EA can resend a deal; keep one copy per ticket.
    const deals = [...new Map(all.map((d) => [d.ticket, d])).values()].sort(
      (a, b) => a.time - b.time || compareTickets(a.ticket, b.ticket),
    );
    const ins = deals.filter((d) => d.entry === "in");
    if (ins.length === 0) continue;
    const outs = deals.filter((d) => d.entry !== "in");

    const size = ins.reduce((s, d) => s + d.volume, 0);
    const entry = vwap(ins);
    const closedVolume = outs.reduce((s, d) => s + d.volume, 0);
    const closed = outs.length > 0 && closedVolume >= size - 1e-8;
    const exit = outs.length > 0 ? vwap(outs) : null;
    const last = outs[outs.length - 1];

    const pnl = round2(deals.reduce((s, d) => s + d.profit + d.commission + d.swap + d.fee, 0));
    const risks = ins.map((d) => d.risk).filter((r): r is number => r !== null);
    const riskAmount = risks.length > 0 ? round2(risks.reduce((s, r) => s + r, 0)) : null;

    positions.push({
      ticket,
      pair: normalizePair(ins[0].symbol),
      direction: ins[0].side === "buy" ? "LONG" : "SHORT",
      openDate: toDate(ins[0].time),
      closeDate: closed ? toDate(last.time) : null,
      entry,
      exit,
      // The opening deal carries the original stop; later deals show where
      // it was moved to.
      stopLoss: ins[0].sl ?? last?.sl ?? null,
      takeProfit: ins[0].tp ?? last?.tp ?? null,
      size: Math.round(size * 1e8) / 1e8,
      pnl,
      riskAmount,
      rr: closed && riskAmount ? round2(pnl / riskAmount) : null,
      exitLogic: closed ? exitLogicFor(last.reason, entry, last.price) : null,
    });
  }
  return positions;
}
