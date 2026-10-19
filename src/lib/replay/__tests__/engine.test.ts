import { describe, expect, it } from "vitest";
import { ReplayEngine } from "../engine";
import type { Command } from "../types";
import { at, mkEngine } from "./helpers";

const FLAT: [number, number, number, number] = [1.1, 1.1, 1.1, 1.1];

describe("market orders and exits", () => {
  it("long hits take-profit: P&L, R-multiple and balance", () => {
    const e = mkEngine([FLAT, [1.1, 1.105, 1.099, 1.104], [1.104, 1.111, 1.103, 1.11]]);
    expect(e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: 1.095, tp: 1.11, timeframe: "M1" })).ok).toBe(true);
    e.advanceTo(1);
    expect(e.state.positions).toHaveLength(1);
    e.advanceTo(2);
    const [t] = e.state.trades;
    expect(t.exitReason).toBe("tp");
    expect(t.exitPrice).toBeCloseTo(1.11, 10);
    expect(t.grossPnl).toBeCloseTo(1000, 6);
    expect(t.initialRisk).toBeCloseTo(500, 6);
    expect(t.rMultiple).toBeCloseTo(2, 9);
    expect(t.pips).toBeCloseTo(100, 6);
    expect(e.state.balance).toBeCloseTo(11_000, 6);
  });

  it("short USDJPY converts JPY P&L to USD at the exit price", () => {
    const e = mkEngine([[150, 150, 150, 150], [150, 150.2, 148.9, 149.1]], { symbol: "USDJPY" });
    e.apply(at(e, { type: "market", side: "sell", lots: 1, sl: 151, tp: 149, timeframe: "M1" }));
    e.advanceTo(1);
    const [t] = e.state.trades;
    expect(t.exitReason).toBe("tp");
    expect(t.netPnl).toBeCloseTo(100_000 / 149, 6); // 671.14 USD
    expect(t.initialRisk).toBeCloseTo(100_000 / 151, 6); // 662.25 USD
    expect(t.rMultiple).toBeCloseTo(151 / 149, 9);
  });

  it("charges spread through bid/ask fills and commission per side", () => {
    const e = mkEngine([FLAT, FLAT], { basis: "bid", settings: { spreadPips: 1, commissionPerLot: 7 } });
    const q = e.quoteAt();
    expect(q.bid).toBeCloseTo(1.1, 10);
    expect(q.ask).toBeCloseTo(1.1001, 10);
    e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: null, tp: null, timeframe: "M1" }));
    const pos = e.state.positions[0];
    expect(pos.entryPrice).toBeCloseTo(1.1001, 10);
    // Equity immediately reflects the spread and the entry-side commission.
    expect(e.equity()).toBeCloseTo(10_000 - 10 - 3.5, 6);
    e.apply(at(e, { type: "close", positionId: pos.id }));
    const [t] = e.state.trades;
    expect(t.grossPnl).toBeCloseTo(-10, 6);
    expect(t.commission).toBeCloseTo(7, 9);
    expect(t.netPnl).toBeCloseTo(-17, 6);
    expect(t.rMultiple).toBeNull(); // no initial stop → R unavailable
    expect(e.state.balance).toBeCloseTo(9983, 6);
  });

  it("mid basis splits the spread around the stored price", () => {
    const e = mkEngine([FLAT], { basis: "mid", settings: { spreadPips: 2 } });
    const q = e.quoteAt();
    expect(q.bid).toBeCloseTo(1.0999, 10);
    expect(q.ask).toBeCloseTo(1.1001, 10);
  });

  it("fills a stop at the open when the market gaps through it", () => {
    const e = mkEngine([FLAT, [1.09, 1.092, 1.088, 1.091]]);
    e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: 1.095, tp: null, timeframe: "M1" }));
    e.advanceTo(1);
    const [t] = e.state.trades;
    expect(t.exitPrice).toBeCloseTo(1.09, 10);
    expect(t.netPnl).toBeCloseTo(-1000, 6);
    expect(t.rMultiple).toBeCloseTo(-2, 9);
    expect(t.ambiguous).toBe(false);
  });

  it("assumes the stop-loss first when SL and TP are inside one bar", () => {
    const e = mkEngine([FLAT, [1.1, 1.106, 1.094, 1.1]]);
    e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: 1.095, tp: 1.105, timeframe: "M1" }));
    e.advanceTo(1);
    const [t] = e.state.trades;
    expect(t.exitReason).toBe("sl");
    expect(t.ambiguous).toBe(true);
    expect(t.rMultiple).toBeCloseTo(-1, 9);
  });

  it("applies slippage to market and stop fills but never beyond the bar range", () => {
    const e = mkEngine([FLAT, [1.099, 1.0995, 1.0949, 1.096]], { settings: { slippagePips: 2 } });
    e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: 1.095, tp: null, timeframe: "M1" }));
    expect(e.state.positions[0].entryPrice).toBeCloseTo(1.1002, 10);
    e.advanceTo(1);
    const [t] = e.state.trades;
    expect(t.exitPrice).toBeCloseTo(1.0949, 10); // 1.0948 clamped to the bar low
    expect(t.initialRisk).toBeCloseTo(520, 6);
    expect(t.netPnl).toBeCloseTo(-530, 6);
    expect(t.rMultiple).toBeCloseTo(-530 / 520, 9);
  });

  it("short stop-loss uses ask prices", () => {
    // Bid basis with 1 pip spread: ask high = 1.1050 + 0.0001 reaches SL 1.1051.
    const e = mkEngine([FLAT, [1.1, 1.105, 1.099, 1.1]], { basis: "bid", settings: { spreadPips: 1 } });
    e.apply(at(e, { type: "market", side: "sell", lots: 1, sl: 1.1051, tp: null, timeframe: "M1" }));
    e.advanceTo(1);
    expect(e.state.trades[0].exitReason).toBe("sl");
    expect(e.state.trades[0].exitPrice).toBeCloseTo(1.1051, 10);
  });
});

describe("pending orders", () => {
  it("never fills on the bar it was placed and skips TP on the fill bar", () => {
    const e = mkEngine([
      [1.1, 1.1005, 1.097, 1.1], // low below the limit, but the order comes after this bar
      [1.1, 1.103, 1.0975, 1.101],
      [1.101, 1.1025, 1.1005, 1.102],
    ]);
    e.apply(at(e, { type: "pending", orderType: "buy-limit", price: 1.098, lots: 1, sl: 1.096, tp: 1.102, timeframe: "M1" }));
    expect(e.state.orders).toHaveLength(1);
    e.advanceTo(1);
    expect(e.state.orders).toHaveLength(0);
    expect(e.state.positions).toHaveLength(1);
    expect(e.state.positions[0].entryPrice).toBeCloseTo(1.098, 10);
    expect(e.state.trades).toHaveLength(0); // TP 1.1020 inside bar 1 is not taken
    e.advanceTo(2);
    const [t] = e.state.trades;
    expect(t.exitReason).toBe("tp");
    expect(t.netPnl).toBeCloseTo(400, 6);
    expect(t.rMultiple).toBeCloseTo(2, 9);
  });

  it("buy stop filled and stopped on the same bar is flagged ambiguous (worst case)", () => {
    const e = mkEngine([FLAT, [1.1, 1.103, 1.0985, 1.1]]);
    e.apply(at(e, { type: "pending", orderType: "buy-stop", price: 1.102, lots: 1, sl: 1.099, tp: null, timeframe: "M1" }));
    e.advanceTo(1);
    const [t] = e.state.trades;
    expect(t.entryPrice).toBeCloseTo(1.102, 10);
    expect(t.exitPrice).toBeCloseTo(1.099, 10);
    expect(t.ambiguous).toBe(true);
    expect(t.rMultiple).toBeCloseTo(-1, 9);
  });

  it("limit order gapped through fills at the better open", () => {
    const e = mkEngine([FLAT, [1.097, 1.0975, 1.0965, 1.097]]);
    e.apply(at(e, { type: "pending", orderType: "buy-limit", price: 1.098, lots: 1, sl: null, tp: null, timeframe: "M1" }));
    e.advanceTo(1);
    expect(e.state.positions[0].entryPrice).toBeCloseTo(1.097, 10);
  });

  it("rejects orders on the wrong side of the market", () => {
    const e = mkEngine([FLAT]);
    expect(e.apply(at(e, { type: "pending", orderType: "buy-limit", price: 1.101, lots: 1, sl: null, tp: null, timeframe: "M1" })).ok).toBe(false);
    expect(e.apply(at(e, { type: "pending", orderType: "sell-stop", price: 1.101, lots: 1, sl: null, tp: null, timeframe: "M1" })).ok).toBe(false);
    expect(e.apply(at(e, { type: "pending", orderType: "sell-limit", price: 1.101, lots: 1, sl: 1.1, tp: null, timeframe: "M1" })).ok).toBe(false);
    expect(e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: 1.1005, tp: null, timeframe: "M1" })).ok).toBe(false);
    expect(e.apply(at(e, { type: "market", side: "sell", lots: 1, sl: null, tp: 1.1005, timeframe: "M1" })).ok).toBe(false);
    expect(e.apply(at(e, { type: "market", side: "buy", lots: 0.001, sl: null, tp: null, timeframe: "M1" })).ok).toBe(false);
    expect(e.state.orders).toHaveLength(0);
    expect(e.state.positions).toHaveLength(0);
  });

  it("cancels and modifies pending orders", () => {
    const e = mkEngine([FLAT, FLAT]);
    const c = at(e, { type: "pending", orderType: "sell-limit", price: 1.102, lots: 1, sl: null, tp: null, timeframe: "M1" });
    e.apply(c);
    const id = e.state.orders[0].id;
    expect(e.apply(at(e, { type: "modify-order", orderId: id, price: 1.103, sl: 1.105 })).ok).toBe(true);
    expect(e.state.orders[0].price).toBe(1.103);
    expect(e.apply(at(e, { type: "cancel", orderId: id })).ok).toBe(true);
    expect(e.state.orders).toHaveLength(0);
  });
});

describe("position management", () => {
  it("partial close realises P&L; R uses the initial risk of the full size", () => {
    const e = mkEngine([FLAT, [1.1, 1.1045, 1.0995, 1.104], [1.104, 1.111, 1.103, 1.11]]);
    e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: 1.095, tp: 1.11, timeframe: "M1" }));
    e.advanceTo(1);
    const id = e.state.positions[0].id;
    e.apply(at(e, { type: "close", positionId: id, lots: 0.5 }));
    expect(e.state.balance).toBeCloseTo(10_200, 6);
    expect(e.state.positions[0].lots).toBe(0.5);
    e.advanceTo(2);
    const [t] = e.state.trades;
    expect(t.exits).toHaveLength(2);
    expect(t.netPnl).toBeCloseTo(700, 6);
    expect(t.rMultiple).toBeCloseTo(1.4, 9);
    expect(t.exitPrice).toBeCloseTo(1.107, 10);
    expect(e.state.balance).toBeCloseTo(10_700, 6);
  });

  it("moving the stop never changes the initial risk", () => {
    const e = mkEngine([FLAT, [1.1, 1.1045, 1.0995, 1.104], [1.104, 1.1045, 1.098, 1.1]]);
    e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: 1.095, tp: null, timeframe: "M1" }));
    e.advanceTo(1);
    const id = e.state.positions[0].id;
    expect(e.apply(at(e, { type: "modify-position", positionId: id, sl: 1.099 })).ok).toBe(true);
    // Stop above the current bid would trigger instantly — rejected.
    expect(e.apply(at(e, { type: "modify-position", positionId: id, sl: 1.105 })).ok).toBe(false);
    e.advanceTo(2);
    const [t] = e.state.trades;
    expect(t.initialRisk).toBeCloseTo(500, 6);
    expect(t.finalSl).toBe(1.099);
    expect(t.netPnl).toBeCloseTo(-100, 6);
    expect(t.rMultiple).toBeCloseTo(-0.2, 9);
  });

  it("prevents duplicate submission of the same order", () => {
    const e = mkEngine([FLAT]);
    const cmd = at(e, { type: "market", side: "buy", lots: 1, sl: null, tp: null, timeframe: "M1" });
    expect(e.apply(cmd).ok).toBe(true);
    const second = e.apply(cmd);
    expect(second.ok).toBe(false);
    expect(e.state.positions).toHaveLength(1);
  });
});

describe("replay boundaries and determinism", () => {
  it("clamps advancing to the data end and never moves backward", () => {
    const e = mkEngine([FLAT, FLAT, FLAT]);
    e.advanceTo(99);
    expect(e.state.index).toBe(2);
    e.advanceTo(0);
    expect(e.state.index).toBe(2);
  });

  it("rejects commands stamped before the session start", () => {
    const e = mkEngine([FLAT, FLAT, FLAT], { startIndex: 1 });
    const early: Command = { id: "x", at: e.cfg.bars.t[0], type: "market", side: "buy", lots: 1, sl: null, tp: null, timeframe: "M1" };
    const r = e.rebuild([early], 2);
    expect(r.rejected).toHaveLength(1);
    expect(e.state.positions).toHaveLength(0);
  });

  it("rebuilding from commands reproduces the live ledger exactly", () => {
    const rows: [number, number, number, number][] = [
      FLAT,
      [1.1, 1.1045, 1.0995, 1.104],
      [1.104, 1.106, 1.1, 1.105],
      [1.105, 1.107, 1.098, 1.099],
      [1.099, 1.1, 1.09, 1.092],
      [1.092, 1.1, 1.091, 1.099],
    ];
    const live = mkEngine(rows);
    const cmds: Command[] = [];
    const run = (c: Command) => {
      cmds.push(c);
      expect(live.apply(c).ok).toBe(true);
    };
    run(at(live, { type: "market", side: "buy", lots: 0.5, sl: 1.095, tp: 1.106, timeframe: "M5" }));
    live.advanceTo(1);
    run(at(live, { type: "pending", orderType: "sell-limit", price: 1.1065, lots: 0.3, sl: 1.11, tp: 1.093, timeframe: "M5" }));
    live.advanceTo(3);
    live.advanceTo(5);

    const replayed = mkEngine(rows);
    replayed.rebuild(cmds, 5);
    expect(replayed.state.trades).toEqual(live.state.trades);
    expect(replayed.state.balance).toBe(live.state.balance);
    expect(replayed.state.trades).toHaveLength(2);
  });

  it("equity reconciles with the ledger and open positions", () => {
    const e = mkEngine([FLAT, [1.1, 1.105, 1.099, 1.104], [1.104, 1.105, 1.1, 1.102]], { basis: "bid", settings: { spreadPips: 1, commissionPerLot: 6 } });
    e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: 1.095, tp: null, timeframe: "M1" }));
    e.apply(at(e, { type: "market", side: "sell", lots: 0.5, sl: 1.11, tp: null, timeframe: "M1" }));
    e.advanceTo(1);
    e.apply(at(e, { type: "close", positionId: e.state.positions[0].id, lots: 0.4 }));
    e.advanceTo(2);
    const realized = e.state.trades.reduce((s, t) => s + t.netPnl, 0) + e.state.positions.reduce((s, p) => s + p.exits.reduce((a, x) => a + x.net, 0), 0);
    expect(e.state.balance).toBeCloseTo(10_000 + realized, 9);
    const unrealized = e.state.positions.reduce((s, p) => s + e.unrealized(p), 0);
    expect(e.equity()).toBeCloseTo(e.state.balance + unrealized, 9);
  });

  it("tracks mark-to-market drawdown at bar closes", () => {
    const e = mkEngine([FLAT, [1.1, 1.1, 1.097, 1.098], [1.098, 1.102, 1.098, 1.101]]);
    e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: null, tp: null, timeframe: "M1" }));
    e.advanceTo(2);
    expect(e.state.maxDrawdown).toBeCloseTo(200, 6); // 1.1000 → close 1.0980
    expect(e.state.maxDrawdownPct).toBeCloseTo(2, 6);
  });

  it("supports a fixed conversion rate for crosses and marks it approximate", () => {
    const e = mkEngine([[0.86, 0.86, 0.86, 0.86], [0.86, 0.866, 0.859, 0.865]], { symbol: "EURGBP", settings: { conversionRate: 1.27 } });
    expect(e.apply(at(e, { type: "market", side: "buy", lots: 1, sl: 0.855, tp: 0.865, timeframe: "M1" })).ok).toBe(true);
    e.advanceTo(1);
    const [t] = e.state.trades;
    expect(t.netPnl).toBeCloseTo(0.005 * 100_000 * 1.27, 6);
    expect(t.exactConversion).toBe(false);
    const noRate = mkEngine([[0.86, 0.86, 0.86, 0.86]], { symbol: "EURGBP" });
    expect(noRate.apply(at(noRate, { type: "market", side: "buy", lots: 1, sl: null, tp: null, timeframe: "M1" })).ok).toBe(false);
  });

  it("is a pure function of data and commands (no hidden state)", () => {
    const e1 = mkEngine([FLAT, FLAT]);
    const e2 = new ReplayEngine(e1.cfg);
    expect(e2.state.balance).toBe(10_000);
    expect(e2.state.index).toBe(0);
  });
});
