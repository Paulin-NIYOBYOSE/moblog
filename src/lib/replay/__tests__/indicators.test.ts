import { describe, expect, it } from "vitest";
import { atr, bollinger, ema, macd, rsi, sma } from "../indicators";

const nan = (x: number) => Number.isNaN(x);

describe("indicators", () => {
  it("SMA", () => {
    const out = Array.from(sma([1, 2, 3, 4, 5], 3));
    expect(out.slice(0, 2).every(nan)).toBe(true);
    expect(out.slice(2)).toEqual([2, 3, 4]);
  });

  it("EMA seeded with the SMA", () => {
    // k = 2/(3+1) = 0.5; seed = mean(1,2,3) = 2; then 4*0.5+2*0.5 = 3; 5*0.5+3*0.5 = 4
    const out = Array.from(ema([1, 2, 3, 4, 5], 3));
    expect(out.slice(2)).toEqual([2, 3, 4]);
    const out2 = Array.from(ema([10, 11, 12, 13, 20], 2));
    // k = 2/3; seed 10.5; 12*2/3+10.5/3 = 11.5; 13*2/3+11.5/3 = 12.5; 20*2/3+12.5/3 = 17.5
    expect(out2.slice(1).map((v) => +v.toFixed(10))).toEqual([10.5, 11.5, 12.5, 17.5]);
  });

  it("RSI matches the StockCharts / Wilder reference example", () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
    ];
    const out = rsi(closes, 14);
    expect(out.slice(0, 14).every(nan)).toBe(true);
    // Exact: avg gain 3.34/14, avg loss 1.40/14 → 100 − 100 / (1 + 2.3857…)
    expect(out[14]).toBeCloseTo(100 - 100 / (1 + 3.34 / 1.4), 6);
    // Published reference values (StockCharts rounds its intermediate averages).
    const reference = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97];
    reference.forEach((ref, k) => expect(Math.abs(out[14 + k] - ref)).toBeLessThan(0.1));
  });

  it("RSI is 100 with no losses and 50 when flat", () => {
    expect(rsi([1, 2, 3, 4], 3)[3]).toBe(100);
    expect(rsi([1, 1, 1, 1], 3)[3]).toBe(50);
  });

  it("ATR uses true range and Wilder smoothing", () => {
    const h = [10, 11, 12, 11];
    const l = [9, 9.5, 10, 9];
    const c = [9.5, 10.5, 11, 10];
    // TR: 1, max(1.5,|11-9.5|,|9.5-9.5|)=1.5, max(2,1.5,0.5)=2, max(2,0,2)=2
    const out = atr(h, l, c, 3);
    expect(out[2]).toBeCloseTo(1.5, 12);
    expect(out[3]).toBeCloseTo((1.5 * 2 + 2) / 3, 12);
  });

  it("MACD line, signal and histogram are aligned", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 3 + i * 0.1);
    const { line, signal, hist } = macd(closes, 12, 26, 9);
    expect(nan(line[24])).toBe(true);
    expect(Number.isFinite(line[25])).toBe(true);
    expect(nan(signal[32])).toBe(true);
    expect(Number.isFinite(signal[33])).toBe(true);
    expect(hist[40]).toBeCloseTo(line[40] - signal[40], 12);
  });

  it("Bollinger bands with population standard deviation", () => {
    const { mid, upper, lower } = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    // mean 5, population sd 2
    expect(mid[7]).toBe(5);
    expect(upper[7]).toBeCloseTo(9, 12);
    expect(lower[7]).toBeCloseTo(1, 12);
  });

  it("only uses data up to each index (no look-ahead)", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const full = ema(a, 3);
    const partial = ema(a.slice(0, 5), 3);
    expect(Array.from(partial)).toEqual(Array.from(full.slice(0, 5)));
    expect(Array.from(rsi(a.slice(0, 6), 3))).toEqual(Array.from(rsi(a, 3).slice(0, 6)));
  });
});
