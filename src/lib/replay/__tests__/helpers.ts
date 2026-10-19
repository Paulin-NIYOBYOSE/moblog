import { barsFromCandles } from "../bars";
import { ReplayEngine } from "../engine";
import { resolveInstrument } from "../instruments";
import type { Bars, Command, PriceBasis, SessionSettings, TradeRecord } from "../types";

/** Tue 2 Jan 2024 10:00 UTC — a normal mid-week London morning. */
export const T0 = Date.UTC(2024, 0, 2, 10, 0) / 1000;

export function m1(rows: [number, number, number, number][], start = T0, step = 60): Bars {
  return barsFromCandles(rows.map(([o, h, l, c], i) => ({ t: start + i * step, o, h, l, c, v: 1 })));
}

export function settings(over: Partial<SessionSettings> = {}): SessionSettings {
  return {
    initialBalance: 10_000,
    accountCurrency: "USD",
    riskMode: "percent",
    riskPercent: 1,
    riskMoney: 100,
    fixedLots: 1,
    spreadMode: "fixed",
    spreadPips: 0,
    slippagePips: 0,
    commissionPerLot: 0,
    conversionRate: null,
    dayBoundary: "ny-close",
    pauseOnFill: false,
    ...over,
  };
}

export function mkEngine(
  rows: [number, number, number, number][],
  opts: { symbol?: string; basis?: PriceBasis; settings?: Partial<SessionSettings>; startIndex?: number } = {},
) {
  const bars = m1(rows);
  return new ReplayEngine({
    bars,
    baseTf: "M1",
    spec: resolveInstrument(opts.symbol ?? "EURUSD")!,
    basis: opts.basis ?? "mid",
    settings: settings(opts.settings),
    startIndex: opts.startIndex ?? 0,
    sessionId: "s1",
  });
}

let seq = 0;
export function cmdId() {
  return `c${++seq}`;
}

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Build a command stamped at the engine's current replay point. */
export function at(engine: ReplayEngine, cmd: DistOmit<Command, "id" | "at">): Command {
  return { ...cmd, id: cmdId(), at: engine.cfg.bars.t[engine.state.index] } as Command;
}

export function trade(p: Partial<TradeRecord> & { netPnl: number; exitT: number }): TradeRecord {
  const entryT = p.entryT ?? p.exitT - 3600;
  return {
    id: p.id ?? `t${++seq}`,
    sessionId: p.sessionId ?? "s1",
    symbol: p.symbol ?? "EURUSD",
    side: p.side ?? "buy",
    orderType: "market",
    timeframe: p.timeframe ?? "M15",
    lots: 1,
    entryT,
    entryPrice: 1.1,
    exitT: p.exitT,
    exitPrice: 1.1,
    exitReason: "manual",
    initialSl: 1.09,
    initialTp: null,
    finalSl: 1.09,
    initialRisk: p.initialRisk === undefined ? 100 : p.initialRisk,
    grossPnl: p.netPnl,
    commission: 0,
    netPnl: p.netPnl,
    rMultiple: p.rMultiple === undefined ? p.netPnl / 100 : p.rMultiple,
    pips: 0,
    holdingSeconds: p.exitT - entryT,
    exits: p.exits ?? [{ t: p.exitT, lots: 1, price: 1.1, reason: "manual", gross: p.netPnl, commission: 0, net: p.netPnl, ambiguous: false }],
    mae: 0,
    mfe: 0,
    ambiguous: false,
    exactConversion: true,
    spreadAtEntry: 0,
  };
}
