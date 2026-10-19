import { describe, expect, it } from "vitest";
import { aggregate, endOfCandle, nextBucketStart, startOfCandle } from "../aggregate";
import { barsFromCandles } from "../bars";
import { parseTimestamp } from "../csv";
import {
  availableTimeframes,
  bucketStart,
  fromInputValue,
  isWeekendGap,
  marketSessionOf,
  NY_PLUS_7,
  toInputValue,
  tzOffset,
  wallToUtc,
} from "../time";
import { m1 } from "./helpers";

const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;

describe("time zones", () => {
  it("HistData EST (no DST) is always UTC−5", () => {
    expect(parseTimestamp("20240102 000000", "compact", "Etc/GMT+5")).toBe(utc(2024, 1, 2, 5));
    expect(parseTimestamp("20240702 000000", "compact", "Etc/GMT+5")).toBe(utc(2024, 7, 2, 5));
    expect(parseTimestamp("20240102 000003660", "compact", "Etc/GMT+5")).toBeCloseTo(utc(2024, 1, 2, 5) + 3.66, 6);
  });

  it("New York observes DST; server time NY+7 is GMT+2 / GMT+3", () => {
    expect(wallToUtc(utc(2024, 7, 1, 12), "America/New_York")).toBe(utc(2024, 7, 1, 16));
    expect(wallToUtc(utc(2024, 1, 15, 12), "America/New_York")).toBe(utc(2024, 1, 15, 17));
    expect(tzOffset(NY_PLUS_7, utc(2024, 1, 15))).toBe(2 * 3600);
    expect(tzOffset(NY_PLUS_7, utc(2024, 7, 15))).toBe(3 * 3600);
    expect(tzOffset("Europe/London", utc(2024, 7, 15))).toBe(3600);
  });

  it("parses Dukascopy, MetaTrader, US and unix timestamps", () => {
    expect(parseTimestamp("02.01.2024 00:00:00.000", "dmy", "UTC")).toBe(utc(2024, 1, 2));
    expect(parseTimestamp("02.01.2024 02:00:00.000 GMT+0200", "dmy", "UTC")).toBe(utc(2024, 1, 2)); // embedded offset wins
    expect(parseTimestamp("2024.01.02 17:30", "ymd", "UTC")).toBe(utc(2024, 1, 2, 17, 30));
    expect(parseTimestamp("2024-01-02T17:30:00Z", "ymd", "America/New_York")).toBe(utc(2024, 1, 2, 17, 30));
    expect(parseTimestamp("01/02/2024 17:30", "mdy", "UTC")).toBe(utc(2024, 1, 2, 17, 30));
    expect(parseTimestamp("1704153600", "unix-s", "UTC")).toBe(utc(2024, 1, 2));
    expect(parseTimestamp("1704153600000", "unix-ms", "UTC")).toBe(utc(2024, 1, 2));
    expect(parseTimestamp("2024-13-02 00:00", "ymd", "UTC")).toBeNull();
    expect(parseTimestamp("garbage", "ymd", "UTC")).toBeNull();
  });

  it("round-trips datetime-local input values in a display zone", () => {
    const t = utc(2024, 3, 4, 14, 30);
    expect(toInputValue(t, "America/New_York")).toBe("2024-03-04T09:30");
    expect(fromInputValue("2024-03-04T09:30", "America/New_York")).toBe(t);
  });

  it("recognises the weekly closure as an expected gap", () => {
    // Fri 5 Jan 2024 21:59 UTC (16:59 EST) → Sun 7 Jan 22:00 UTC (17:00 EST)
    expect(isWeekendGap(utc(2024, 1, 5, 22), utc(2024, 1, 7, 22))).toBe(true);
    expect(isWeekendGap(utc(2024, 1, 3, 10), utc(2024, 1, 3, 13))).toBe(false);
  });

  it("classifies market sessions with DST", () => {
    expect(marketSessionOf(utc(2024, 1, 3, 2))).toBe("Asia");
    expect(marketSessionOf(utc(2024, 1, 3, 9))).toBe("London");
    expect(marketSessionOf(utc(2024, 1, 3, 14))).toBe("London/NY overlap");
    expect(marketSessionOf(utc(2024, 1, 3, 19))).toBe("New York");
    // July: London 07:00 UTC start (BST)
    expect(marketSessionOf(utc(2024, 7, 3, 7, 30))).toBe("London");
  });
});

describe("candle aggregation", () => {
  it("M1 → M5 with exact OHLCV", () => {
    const rows: [number, number, number, number][] = Array.from({ length: 10 }, (_, i) => [1 + i, 1.5 + i, 0.5 + i, 1.2 + i]);
    const out = aggregate(m1(rows), "M1", "M5", "ny-close");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ open: 1, high: 5.5, low: 0.5, close: 5.2, volume: 5, first: 0, last: 4, forming: false });
    expect(out[1]).toMatchObject({ open: 6, high: 10.5, low: 5.5, close: 10.2, first: 5, last: 9 });
  });

  it("marks the last candle forming until its period has elapsed, and never reads past `upto`", () => {
    const rows: [number, number, number, number][] = Array.from({ length: 10 }, (_, i) => [1, 2 + i, 0.5, 1]);
    const out = aggregate(m1(rows), "M1", "M5", "ny-close", 6);
    expect(out).toHaveLength(2);
    expect(out[1].forming).toBe(true);
    expect(out[1].high).toBe(8); // bars 5..6 only — bar 9's high of 11 is not visible
    const complete = aggregate(m1(rows), "M1", "M5", "ny-close", 9);
    expect(complete[1].forming).toBe(false);
  });

  it("H4 and D1 align to the 17:00 New York close (winter and summer)", () => {
    expect(bucketStart(utc(2024, 1, 2, 23, 30), "H4", "ny-close")).toBe(utc(2024, 1, 2, 22));
    expect(bucketStart(utc(2024, 1, 2, 21, 59), "D1", "ny-close")).toBe(utc(2024, 1, 1, 22));
    expect(bucketStart(utc(2024, 1, 2, 22, 0), "D1", "ny-close")).toBe(utc(2024, 1, 2, 22));
    expect(bucketStart(utc(2024, 7, 2, 21, 0), "D1", "ny-close")).toBe(utc(2024, 7, 2, 21));
    expect(bucketStart(utc(2024, 7, 2, 20, 59), "D1", "ny-close")).toBe(utc(2024, 7, 1, 21));
    expect(bucketStart(utc(2024, 1, 2, 21, 59), "D1", "utc")).toBe(utc(2024, 1, 2));
    expect(bucketStart(utc(2024, 1, 2, 10, 17), "M15", "ny-close")).toBe(utc(2024, 1, 2, 10, 15));
  });

  it("W1 starts at the Sunday 17:00 New York open", () => {
    expect(bucketStart(utc(2024, 1, 7, 22, 30), "W1", "ny-close")).toBe(utc(2024, 1, 7, 22));
    expect(bucketStart(utc(2024, 1, 12, 21, 0), "W1", "ny-close")).toBe(utc(2024, 1, 7, 22));
    expect(nextBucketStart(utc(2024, 1, 7, 22), "W1", "ny-close")).toBe(utc(2024, 1, 14, 22));
  });

  it("D1 across the US DST change spans 23 hours of market time", () => {
    // DST began Sun 10 Mar 2024 02:00 New York. The server day that opened
    // Sat 22:00 UTC (17:00 EST) ends Sun 21:00 UTC (17:00 EDT) — 23 hours.
    expect(nextBucketStart(utc(2024, 3, 8, 22), "D1", "ny-close")).toBe(utc(2024, 3, 9, 22));
    expect(nextBucketStart(utc(2024, 3, 9, 22), "D1", "ny-close")).toBe(utc(2024, 3, 10, 21));
  });

  it("finds the bounds of the chart candle containing a base bar", () => {
    const b = m1(Array.from({ length: 30 }, () => [1, 1, 1, 1] as [number, number, number, number]));
    expect(startOfCandle(b, 17, "M15", "M1", "ny-close")).toBe(15);
    expect(endOfCandle(b, 17, "M15", "M1", "ny-close")).toBe(29);
    expect(endOfCandle(b, 3, "M1", "M1", "ny-close")).toBe(3);
  });

  it("skips missing candles without inventing prices", () => {
    const b = barsFromCandles([
      { t: utc(2024, 1, 2, 10, 0), o: 1, h: 2, l: 0.5, c: 1.5, v: 1 },
      { t: utc(2024, 1, 2, 10, 20), o: 1.5, h: 3, l: 1, c: 2, v: 1 },
    ]);
    const out = aggregate(b, "M1", "M5", "ny-close");
    expect(out).toHaveLength(2);
    expect(out[1].time).toBe(utc(2024, 1, 2, 10, 20));
  });

  it("lists only timeframes that are whole multiples of the source", () => {
    expect(availableTimeframes("M1")).toEqual(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"]);
    expect(availableTimeframes("M15")).toEqual(["M15", "M30", "H1", "H4", "D1", "W1"]);
    expect(availableTimeframes("H1")).toEqual(["H1", "H4", "D1", "W1"]);
  });
});
