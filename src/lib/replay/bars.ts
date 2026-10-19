import type { Bars, Candle } from "./types";

export function allocBars(n: number, withSpread = false): Bars {
  return {
    t: new Float64Array(n),
    o: new Float64Array(n),
    h: new Float64Array(n),
    l: new Float64Array(n),
    c: new Float64Array(n),
    v: new Float64Array(n),
    sp: withSpread ? new Float32Array(n).fill(NaN) : null,
    n,
  };
}

export function emptyBars(): Bars {
  return allocBars(0);
}

export function barsFromCandles(candles: Candle[], spreads?: number[]): Bars {
  const b = allocBars(candles.length, Boolean(spreads));
  candles.forEach((c, i) => {
    b.t[i] = c.t;
    b.o[i] = c.o;
    b.h[i] = c.h;
    b.l[i] = c.l;
    b.c[i] = c.c;
    b.v[i] = c.v;
    if (spreads && b.sp) b.sp[i] = spreads[i];
  });
  return b;
}

export function candleAt(b: Bars, i: number): Candle {
  return { t: b.t[i], o: b.o[i], h: b.h[i], l: b.l[i], c: b.c[i], v: b.v[i] };
}

/** Copy of bars[from, to) — typed-array views are copied so chunks stay independent. */
export function sliceBars(b: Bars, from: number, to: number): Bars {
  const s = Math.max(0, from);
  const e = Math.min(b.n, to);
  const n = Math.max(0, e - s);
  return {
    t: b.t.slice(s, s + n),
    o: b.o.slice(s, s + n),
    h: b.h.slice(s, s + n),
    l: b.l.slice(s, s + n),
    c: b.c.slice(s, s + n),
    v: b.v.slice(s, s + n),
    sp: b.sp ? b.sp.slice(s, s + n) : null,
    n,
  };
}

export function concatBars(parts: Bars[]): Bars {
  const n = parts.reduce((s, p) => s + p.n, 0);
  const withSpread = parts.some((p) => p.sp);
  const out = allocBars(n, withSpread);
  let off = 0;
  for (const p of parts) {
    out.t.set(p.t.subarray(0, p.n), off);
    out.o.set(p.o.subarray(0, p.n), off);
    out.h.set(p.h.subarray(0, p.n), off);
    out.l.set(p.l.subarray(0, p.n), off);
    out.c.set(p.c.subarray(0, p.n), off);
    out.v.set(p.v.subarray(0, p.n), off);
    if (out.sp && p.sp) out.sp.set(p.sp.subarray(0, p.n), off);
    off += p.n;
  }
  return out;
}

/** Index of the first bar with t >= target (n if none). */
export function lowerBound(t: Float64Array, n: number, target: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (t[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the last bar with t <= target (-1 if none). */
export function indexAtOrBefore(b: Bars, target: number): number {
  return lowerBound(b.t, b.n, target + 1e-6) - 1;
}

/**
 * Merge two sorted bar sets. On equal timestamps the `keep` side wins; the
 * number of conflicting (different OHLC) duplicates is reported.
 */
export function mergeBars(existing: Bars, incoming: Bars): { bars: Bars; conflicts: number; duplicates: number } {
  const withSpread = Boolean(existing.sp || incoming.sp);
  const out = allocBars(existing.n + incoming.n, withSpread);
  let i = 0;
  let j = 0;
  let k = 0;
  let conflicts = 0;
  let duplicates = 0;
  const copy = (src: Bars, idx: number) => {
    out.t[k] = src.t[idx];
    out.o[k] = src.o[idx];
    out.h[k] = src.h[idx];
    out.l[k] = src.l[idx];
    out.c[k] = src.c[idx];
    out.v[k] = src.v[idx];
    if (out.sp) out.sp[k] = src.sp ? src.sp[idx] : NaN;
    k++;
  };
  while (i < existing.n || j < incoming.n) {
    if (j >= incoming.n || (i < existing.n && existing.t[i] < incoming.t[j])) {
      copy(existing, i++);
    } else if (i >= existing.n || incoming.t[j] < existing.t[i]) {
      copy(incoming, j++);
    } else {
      duplicates++;
      if (
        existing.o[i] !== incoming.o[j] ||
        existing.h[i] !== incoming.h[j] ||
        existing.l[i] !== incoming.l[j] ||
        existing.c[i] !== incoming.c[j]
      ) {
        conflicts++;
      }
      copy(existing, i++);
      j++;
    }
  }
  return { bars: sliceBars(out, 0, k), conflicts, duplicates };
}

/** Cheap content fingerprint (FNV-1a over timestamps and closes). */
export function fingerprintBars(b: Bars): string {
  let h = 0x811c9dc5;
  const mix = (x: number) => {
    const s = Math.round(x * 1e6);
    h ^= s & 0xffff;
    h = Math.imul(h, 0x01000193);
    h ^= (s >>> 16) & 0xffff;
    h = Math.imul(h, 0x01000193);
  };
  for (let i = 0; i < b.n; i++) {
    mix(b.t[i]);
    mix(b.c[i]);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + "-" + b.n.toString(36);
}
