import { describe, expect, it } from "vitest";
import { priceToPips, quoteToAccount, resolveInstrument, symbolFromText } from "../instruments";
import { computeSizing, floorLots, lossPerLot, moneyForMove } from "../sizing";

const EURUSD = resolveInstrument("EURUSD")!;
const USDJPY = resolveInstrument("USDJPY")!;
const XAUUSD = resolveInstrument("XAUUSD")!;
const EURGBP = resolveInstrument("EURGBP")!;

const base = {
  side: "buy" as const,
  equity: 10_000,
  riskPercent: 1,
  riskMoney: 100,
  fixedLots: 1,
  tp: null,
  accountCurrency: "USD",
  conversionRate: null,
};

describe("pips and instrument specs", () => {
  it("EURUSD pip is 0.0001, USDJPY pip is 0.01", () => {
    expect(EURUSD.pipSize).toBe(0.0001);
    expect(USDJPY.pipSize).toBe(0.01);
    expect(priceToPips(0.005, EURUSD)).toBeCloseTo(50, 9);
    expect(priceToPips(0.5, USDJPY)).toBeCloseTo(50, 9);
    expect(XAUUSD.contractSize).toBe(100);
  });

  it("derives specs for unlisted pairs and finds symbols in file names", () => {
    const gbpsek = resolveInstrument("GBPSEK")!;
    expect(gbpsek.base).toBe("GBP");
    expect(gbpsek.pipSize).toBe(0.0001);
    expect(resolveInstrument("ZZZQQQ")).toBeNull();
    expect(symbolFromText("DAT_ASCII_EURUSD_M1_2024.csv")).toBe("EURUSD");
    expect(symbolFromText("gbp_jpy-1m.csv")).toBe("GBPJPY");
    expect(symbolFromText("XAUUSD_Candlestick_1_M_BID_01.01.2024-31.12.2024.csv")).toBe("XAUUSD");
  });

  it("converts quote currency: identity, inverse, fixed or missing", () => {
    expect(quoteToAccount(EURUSD, "USD", 1.1, null)).toMatchObject({ rate: 1, exact: true });
    expect(quoteToAccount(USDJPY, "USD", 150, null).rate).toBeCloseTo(1 / 150, 12);
    expect(quoteToAccount(EURGBP, "USD", 0.86, 1.27)).toMatchObject({ rate: 1.27, exact: false, source: "fixed" });
    expect(quoteToAccount(EURGBP, "USD", 0.86, null).source).toBe("missing");
  });
});

describe("monetary P&L", () => {
  it("long and short P&L on EURUSD and USDJPY", () => {
    expect(moneyForMove(0.005, 1, EURUSD, "USD", 1.105, null)).toBeCloseTo(500, 9);
    expect(moneyForMove(-0.005, 2, EURUSD, "USD", 1.095, null)).toBeCloseTo(-1000, 9);
    // 50 pips on USDJPY at 150.00 = 50,000 JPY ≈ $333.33
    expect(moneyForMove(0.5, 1, USDJPY, "USD", 150, null)).toBeCloseTo(50_000 / 150, 9);
    expect(lossPerLot(150, 149.5, USDJPY, "USD", null)).toBeCloseTo(50_000 / 149.5, 9);
  });

  it("gold uses its 100 oz contract", () => {
    expect(lossPerLot(2000, 1990, XAUUSD, "USD", null)).toBeCloseTo(1000, 9);
  });
});

describe("position sizing", () => {
  it("fixed monetary risk", () => {
    const r = computeSizing({ ...base, mode: "money", entry: 1.1, sl: 1.095, spec: EURUSD });
    expect(r.errors).toEqual([]);
    expect(r.lots).toBe(0.2);
    expect(r.riskMoney).toBeCloseTo(100, 6);
    expect(r.slPips).toBeCloseTo(50, 6);
  });

  it("percentage of equity, rounded down to the lot step (USDJPY)", () => {
    const r = computeSizing({ ...base, mode: "percent", entry: 150, sl: 149.5, spec: USDJPY });
    // $100 / ($50,000 / 149.5) = 0.299 lots → 0.29
    expect(r.lots).toBe(0.29);
    expect(r.riskMoney).toBeCloseTo((0.29 * 50_000) / 149.5, 6);
    expect(r.riskPercent!).toBeLessThanOrEqual(1);
  });

  it("gold: 1% of $10k with a $10 stop is 0.10 lots", () => {
    const r = computeSizing({ ...base, mode: "percent", entry: 2000, sl: 1990, spec: XAUUSD });
    expect(r.lots).toBe(0.1);
  });

  it("crosses need a conversion rate and say so", () => {
    const missing = computeSizing({ ...base, mode: "percent", entry: 0.86, sl: 0.855, spec: EURGBP });
    expect(missing.errors[0]).toMatch(/conversion rate/);
    const ok = computeSizing({ ...base, mode: "money", riskMoney: 635, conversionRate: 1.27, entry: 0.86, sl: 0.855, spec: EURGBP });
    expect(ok.lots).toBe(1);
    expect(ok.exactConversion).toBe(false);
    expect(ok.warnings.join(" ")).toMatch(/approximate/);
  });

  it("refuses a size below the minimum lot instead of inflating risk", () => {
    const r = computeSizing({ ...base, mode: "money", riskMoney: 1, entry: 1.1, sl: 1.095, spec: EURUSD });
    expect(r.lots).toBe(0);
    expect(r.errors[0]).toMatch(/minimum/);
  });

  it("validates stop and target sides and computes R:R", () => {
    const wrong = computeSizing({ ...base, mode: "percent", entry: 1.1, sl: 1.105, spec: EURUSD });
    expect(wrong.errors.length).toBeGreaterThan(0);
    const rr = computeSizing({ ...base, mode: "percent", entry: 1.1, sl: 1.095, tp: 1.115, spec: EURUSD });
    expect(rr.rr).toBeCloseTo(3, 9);
    expect(rr.rewardMoney).toBeCloseTo(0.015 * 100_000 * 0.2, 6);
    const short = computeSizing({ ...base, side: "sell", mode: "percent", entry: 1.1, sl: 1.105, tp: 1.09, spec: EURUSD });
    expect(short.errors).toEqual([]);
    expect(short.lots).toBe(0.2);
  });

  it("risk-based sizing requires a stop", () => {
    const r = computeSizing({ ...base, mode: "percent", entry: 1.1, sl: null, spec: EURUSD });
    expect(r.errors[0]).toMatch(/stop-loss/);
    const lots = computeSizing({ ...base, mode: "lots", fixedLots: 0.37, entry: 1.1, sl: null, spec: EURUSD });
    expect(lots.lots).toBe(0.37);
    expect(lots.riskMoney).toBeNull();
  });

  it("floorLots never rounds up", () => {
    expect(floorLots(0.299999)).toBe(0.29);
    expect(floorLots(0.3)).toBe(0.3);
    expect(floorLots(1.005)).toBe(1);
    expect(floorLots(-1)).toBe(0);
  });
});
