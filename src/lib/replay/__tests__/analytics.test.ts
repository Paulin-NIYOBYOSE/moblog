import { describe, expect, it } from "vitest";
import {
  byWeekday,
  computeMetrics,
  cumulativeR,
  drawdownStats,
  enrichTrades,
  equityCurve,
  filterTrades,
  holdingDistribution,
  median,
  outcomeOf,
  rDistribution,
} from "../analytics";
import { trade } from "./helpers";

const DAY = 86_400;
const D1 = Date.UTC(2024, 2, 4, 12) / 1000; // Mon 4 Mar 2024

const sample = () => [
  trade({ id: "A", netPnl: 200, exitT: D1 }),
  trade({ id: "B", netPnl: -100, exitT: D1 + DAY }),
  trade({ id: "C", netPnl: -100, exitT: D1 + 2 * DAY }),
  trade({ id: "D", netPnl: 300, exitT: D1 + 3 * DAY, side: "sell" }),
  trade({ id: "E", netPnl: 0, exitT: D1 + 4 * DAY }),
];

describe("core metrics", () => {
  it("win rate, gross figures, profit factor and expectancy", () => {
    const m = computeMetrics(sample(), 10_000);
    expect(m.total).toBe(5);
    expect(m.wins).toBe(2);
    expect(m.losses).toBe(2);
    expect(m.breakeven).toBe(1);
    expect(m.winRate).toBeCloseTo(40, 9);
    expect(m.lossRate).toBeCloseTo(40, 9);
    expect(m.grossProfit).toBe(500);
    expect(m.grossLoss).toBe(200);
    expect(m.netPnl).toBe(300);
    expect(m.returnPct).toBeCloseTo(3, 9);
    expect(m.profitFactor).toBeCloseTo(2.5, 9);
    expect(m.profitFactorNote).toBe("finite");
    expect(m.expectancyR).toBeCloseTo(0.6, 9);
    expect(m.expectancyMoney).toBeCloseTo(60, 9);
    expect(m.avgWin).toBe(250);
    expect(m.avgLoss).toBe(-100);
    expect(m.medianR).toBe(0);
    expect(m.largestWin).toBe(300);
    expect(m.largestLoss).toBe(-100);
    expect(m.maxConsecWins).toBe(1);
    expect(m.maxConsecLosses).toBe(2);
    expect(m.long.count).toBe(4);
    expect(m.short.count).toBe(1);
    expect(m.short.net).toBe(300);
  });

  it("max drawdown comes from the chronological curve, not the trade list order", () => {
    const shuffled = sample().reverse();
    const m = computeMetrics(shuffled, 10_000);
    expect(m.maxDrawdown).toBeCloseTo(200, 9); // 10,200 → 10,000
    expect(m.maxDrawdownPct).toBeCloseTo((200 / 10_200) * 100, 9);
    expect(m.ddPeakT).toBe(D1);
    expect(m.ddTroughT).toBe(D1 + 2 * DAY);
    expect(m.ddRecoveryT).toBe(D1 + 3 * DAY);
  });

  it("profit factor is not reported as infinity when there are no losses", () => {
    const m = computeMetrics([trade({ netPnl: 100, exitT: D1 }), trade({ netPnl: 50, exitT: D1 + DAY })], 10_000);
    expect(m.profitFactor).toBeNull();
    expect(m.profitFactorNote).toBe("no-losses");
    const empty = computeMetrics([], 10_000);
    expect(empty.profitFactorNote).toBe("no-trades");
    expect(empty.winRate).toBeNull();
    expect(empty.expectancyR).toBeNull();
  });

  it("R-multiples: unavailable risk is excluded from R stats but counted as a trade", () => {
    const m = computeMetrics([trade({ netPnl: 200, exitT: D1 }), trade({ netPnl: 100, exitT: D1 + DAY, initialRisk: null, rMultiple: null })], 10_000);
    expect(m.total).toBe(2);
    expect(m.validR).toBe(1);
    expect(m.expectancyR).toBeCloseTo(2, 9);
    expect(m.expectancyMoney).toBeCloseTo(150, 9);
  });

  it("optional breakeven band in R", () => {
    const t = trade({ netPnl: -3, exitT: D1, rMultiple: -0.03 });
    expect(outcomeOf(t)).toBe("loss");
    expect(outcomeOf(t, 0.05)).toBe("breakeven");
  });

  it("median handles even and odd counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("curves and distributions", () => {
  it("equity curve includes partial exits in time order", () => {
    const partial = trade({
      id: "P",
      netPnl: 150,
      exitT: D1 + 2 * DAY,
      exits: [
        { t: D1, lots: 0.5, price: 1.1, reason: "partial", gross: 100, commission: 0, net: 100, ambiguous: false },
        { t: D1 + 2 * DAY, lots: 0.5, price: 1.1, reason: "tp", gross: 50, commission: 0, net: 50, ambiguous: false },
      ],
    });
    const other = trade({ id: "Q", netPnl: -80, exitT: D1 + DAY });
    const curve = equityCurve([partial, other], 1000);
    expect(curve.map((p) => p.equity)).toEqual([1000, 1100, 1020, 1070]);
    const dd = drawdownStats(curve);
    expect(dd.maxDrawdown).toBe(80);
    expect(dd.recoveryT).toBeNull(); // never got back to 1,100
  });

  it("cumulative R, R histogram and holding-time bins add up", () => {
    const ts = sample();
    expect(cumulativeR(ts).map((p) => p.r)).toEqual([2, 1, 0, 3, 3]);
    const bins = rDistribution(ts);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(bins.find((b) => b.from === 2)!.count).toBe(1);
    expect(holdingDistribution(ts).reduce((s, b) => s + b.count, 0)).toBe(5);
  });

  it("weekday breakdown uses the 17:00 New York roll", () => {
    // Sunday 23:00 UTC is Monday in forex server time.
    const sun = Date.UTC(2024, 2, 3, 23) / 1000;
    const rows = byWeekday([trade({ netPnl: 10, entryT: sun, exitT: sun + 600 })]);
    expect(rows.find((r) => r.count === 1)!.key).toBe("Mon");
  });
});

describe("filters", () => {
  const enriched = () =>
    enrichTrades(sample(), { B: { tags: ["fomo"], strategy: "Breakout" }, D: { tags: ["a+"], setup: "Retest" } }, "Trend", "Session 1");

  it("date bounds are inclusive on exit time", () => {
    const f = filterTrades(enriched(), { from: D1 + DAY, to: D1 + 3 * DAY });
    expect(f.map((t) => t.id)).toEqual(["B", "C", "D"]);
    const none = filterTrades(enriched(), { from: D1 + 3 * DAY + 1, to: D1 + 4 * DAY - 1 });
    expect(none).toHaveLength(0);
  });

  it("filters by side, tags, strategy, setup, symbol and session", () => {
    const all = enriched();
    expect(filterTrades(all, { side: "sell" }).map((t) => t.id)).toEqual(["D"]);
    expect(filterTrades(all, { tags: ["fomo", "a+"] }).map((t) => t.id)).toEqual(["B", "D"]);
    expect(filterTrades(all, { strategies: ["Breakout"] }).map((t) => t.id)).toEqual(["B"]);
    expect(filterTrades(all, { strategies: ["Trend"] })).toHaveLength(4);
    expect(filterTrades(all, { setups: ["Retest"] }).map((t) => t.id)).toEqual(["D"]);
    expect(filterTrades(all, { symbols: ["GBPUSD"] })).toHaveLength(0);
    expect(filterTrades(all, { sessionIds: ["s1"] })).toHaveLength(5);
  });

  it("metrics recompute on the filtered subset", () => {
    const m = computeMetrics(filterTrades(enriched(), { from: D1 + DAY, to: D1 + 2 * DAY }), 10_000);
    expect(m.total).toBe(2);
    expect(m.winRate).toBe(0);
    expect(m.netPnl).toBe(-200);
  });
});
