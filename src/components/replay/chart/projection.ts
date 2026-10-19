import type { ChartBar } from "@/lib/replay/aggregate";
import { atr } from "@/lib/replay/indicators";
import type { Drawing, InstrumentSpec } from "@/lib/replay/types";

/**
 * A Long/Short position projection (TradingView-style). Points:
 * [0] = start time + entry, [1] = end time + target, [2] = end time + stop.
 */
export function projectionLevels(d: Drawing) {
  return {
    side: d.kind === "long" ? ("buy" as const) : ("sell" as const),
    fromT: d.points[0].t,
    toT: d.points[1].t,
    entry: d.points[0].p,
    tp: d.points[1].p,
    sl: d.points[2].p,
  };
}

export function withLevels(d: Drawing, v: { fromT?: number; toT?: number; entry?: number; tp?: number; sl?: number }): Drawing {
  const cur = projectionLevels(d);
  const toT = v.toT ?? cur.toT;
  return {
    ...d,
    points: [
      { t: v.fromT ?? cur.fromT, p: v.entry ?? cur.entry },
      { t: toT, p: v.tp ?? cur.tp },
      { t: toT, p: v.sl ?? cur.sl },
    ],
  };
}

/** New projection at (t, price): stop ≈ 1.5 × ATR(14) (min 10 pips), target 2R, 30 candles wide. */
export function newProjection(kind: "long" | "short", t: number, price: number, spec: InstrumentSpec, bars: ChartBar[], tfSec: number): Drawing {
  let dist = 10 * spec.pipSize;
  if (bars.length > 15) {
    const tail = bars.slice(-200);
    const a = atr(
      tail.map((b) => b.high),
      tail.map((b) => b.low),
      tail.map((b) => b.close),
      14,
    );
    const last = a[a.length - 1];
    if (Number.isFinite(last)) dist = Math.max(dist, last * 1.5);
  }
  const round = (p: number) => +p.toFixed(spec.digits);
  const dir = kind === "long" ? 1 : -1;
  return {
    id: `pj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind,
    color: kind === "long" ? "#089981" : "#f23645",
    points: [
      { t, p: round(price) },
      { t: t + tfSec * 30, p: round(price + dir * dist * 2) },
      { t: t + tfSec * 30, p: round(price - dir * dist) },
    ],
  };
}
