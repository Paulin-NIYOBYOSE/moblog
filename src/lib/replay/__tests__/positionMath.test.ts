import { describe, expect, it } from "vitest";
import { resolveInstrument } from "../instruments";
import { levelLabel, levelStats, rewardRisk, signedMoney, signedPct } from "../positionMath";

const EURUSD = resolveInstrument("EURUSD")!;
const USDJPY = resolveInstrument("USDJPY")!;
const base = { accountCurrency: "USD", conversionRate: null, balance: 10_000 };

describe("position box figures", () => {
  it("long EURUSD target and stop: pips, price %, money, account %", () => {
    const tp = levelStats({ ...base, side: "buy", entry: 1.1, level: 1.105, lots: 0.9, spec: EURUSD });
    expect(tp.pips).toBeCloseTo(50, 9);
    expect(tp.pricePct).toBeCloseTo((0.005 / 1.1) * 100, 9);
    expect(tp.money).toBeCloseTo(450, 6);
    expect(tp.accountPct).toBeCloseTo(4.5, 9);
    const sl = levelStats({ ...base, side: "buy", entry: 1.1, level: 1.0975, lots: 0.9, spec: EURUSD });
    expect(sl.pips).toBeCloseTo(25, 9);
    expect(sl.money).toBeCloseTo(-225, 6);
    expect(sl.accountPct).toBeCloseTo(-2.25, 9);
  });

  it("short USDJPY converts at the level price", () => {
    const tp = levelStats({ ...base, side: "sell", entry: 150, level: 149, lots: 1, spec: USDJPY });
    expect(tp.pips).toBeCloseTo(100, 9);
    expect(tp.money).toBeCloseTo(100_000 / 149, 6);
    const sl = levelStats({ ...base, side: "sell", entry: 150, level: 150.5, lots: 1, spec: USDJPY });
    expect(sl.money).toBeCloseTo(-50_000 / 150.5, 6);
  });

  it("reward:risk and label formatting", () => {
    expect(rewardRisk(1.1, 1.0975, 1.105)).toBeCloseTo(2, 9);
    expect(rewardRisk(1.1, null, 1.105)).toBeNull();
    expect(signedMoney(450, "USD")).toBe("+$450.00");
    expect(signedMoney(-225, "USD")).toBe("−$225.00");
    expect(signedPct(-2.25)).toBe("−2.25%");
    const s = levelStats({ ...base, side: "buy", entry: 1.1, level: 1.105, lots: 0.9, spec: EURUSD });
    expect(levelLabel("Target", 1.105, s, 5, "USD")).toBe("Target: 1.10500 (0.45%) 50.0 pips · Amount: +$450.00 (+4.50%)");
  });
});
