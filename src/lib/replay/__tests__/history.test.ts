import { describe, expect, it } from "vitest";
import { aggregate } from "../aggregate";
import { allocBars, sliceBars } from "../bars";
import { FINE_HISTORY_DAYS, historyPlan, showsContext, withContext } from "../history";
import { bucketKey } from "../time";
import type { Bars } from "../types";

const DAY = 86_400;
const utc = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h) / 1000;

/** Synthetic M1 bars (weekdays only), deterministic prices. */
function m1(fromT: number, toT: number): Bars {
  const b = allocBars(Math.ceil((toT - fromT) / 60));
  let n = 0;
  for (let t = fromT; t < toT; t += 60) {
    const dow = new Date(t * 1000).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const p = 1.1 + Math.sin(t / 7919) * 0.01 + (t % 997) * 1e-7;
    b.t[n] = t;
    b.o[n] = p;
    b.h[n] = p + 0.0002;
    b.l[n] = p - 0.0002;
    b.c[n] = p + 0.00005;
    b.v[n] = 1;
    n++;
  }
  return sliceBars(b, 0, n);
}

/** Hourly bars built from M1 (what FXCM's H1 files / the server aggregation provide). */
function toH1(b: Bars): Bars {
  const c = aggregate(b, "M1", "H1", "utc");
  const out = allocBars(c.length);
  c.forEach((x, i) => {
    out.t[i] = x.time;
    out.o[i] = x.open;
    out.h[i] = x.high;
    out.l[i] = x.low;
    out.c[i] = x.close;
    out.v[i] = x.volume;
  });
  return sliceBars(out, 0, c.length);
}

describe("history plan", () => {
  const startT = utc(2024, 6, 3);

  it("keeps short history as base candles", () => {
    expect(historyPlan({ historyStartT: startT - 91 * DAY, startT }, "M1", "ny-close")).toEqual({ fineFromT: startT - 91 * DAY, context: null });
    expect(historyPlan({ historyStartT: startT, startT }, "M1", "utc").context).toBeNull();
  });

  it("splits long history into hourly context + ~3 months of base candles, on a week boundary", () => {
    const historyStartT = startT - 730 * DAY;
    for (const boundary of ["utc", "ny-close"] as const) {
      const p = historyPlan({ historyStartT, startT }, "M1", boundary);
      expect(p.context).toEqual({ fromT: historyStartT, toT: p.fineFromT });
      expect(p.fineFromT).toBeLessThanOrEqual(startT - FINE_HISTORY_DAYS * DAY);
      expect(p.fineFromT).toBeGreaterThan(startT - (FINE_HISTORY_DAYS + 7) * DAY);
      // A weekly bucket starts exactly there, so D1/W1 candles never straddle the seam.
      expect(bucketKey(p.fineFromT - 1, "W1", boundary)).not.toBe(bucketKey(p.fineFromT, "W1", boundary));
    }
  });

  it("needs no context when the base data is already hourly", () => {
    expect(historyPlan({ historyStartT: startT - 1826 * DAY, startT }, "H1", "utc").context).toBeNull();
  });

  it("shows context on 1h and above only", () => {
    expect(showsContext("M15")).toBe(false);
    expect(showsContext("H1")).toBe(true);
    expect(showsContext("D1")).toBe(true);
  });
});

describe("chart candles with hourly context", () => {
  it("match candles built from 1-minute data everywhere", () => {
    const historyStartT = utc(2024, 1, 1);
    const startT = utc(2024, 6, 3);
    const endT = utc(2024, 6, 10);
    const all = m1(historyStartT, endT);
    for (const boundary of ["utc", "ny-close"] as const) {
      const plan = historyPlan({ historyStartT, startT }, "M1", boundary);
      expect(plan.context).not.toBeNull();
      const ctx = toH1(m1(plan.context!.fromT, plan.context!.toT));
      const fine = m1(plan.fineFromT, endT);
      for (const tf of ["H1", "H4", "D1", "W1"] as const) {
        const merged = withContext(aggregate(ctx, "H1", tf, boundary), aggregate(fine, "M1", tf, boundary));
        const expected = aggregate(all, "M1", tf, boundary);
        expect(merged.map((c) => [c.time, c.open, c.high, c.low, c.close])).toEqual(expected.map((c) => [c.time, c.open, c.high, c.low, c.close]));
      }
    }
  });

  it("drops context candles that overlap the base data", () => {
    const c = (time: number) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 0, first: -1, last: -1, forming: false });
    expect(withContext([c(1), c(2), c(3)], [c(3), c(4)]).map((x) => x.time)).toEqual([1, 2, 3, 4]);
    expect(withContext([], [c(3)]).map((x) => x.time)).toEqual([3]);
    expect(withContext([c(1)], []).map((x) => x.time)).toEqual([1]);
  });
});
