import { formatDuration } from "@/lib/replay/time";
import type { Drawing, DrawingKind } from "@/lib/replay/types";

// Geometry, hit-testing and rendering for user drawings. Anchors are stored
// in market coordinates ({t: unix seconds, p: price}) and converted to pixels
// on every paint, so drawings stay attached through zoom, scroll and resize.

export interface Projector {
  x: (t: number) => number | null;
  y: (p: number) => number | null;
  width: number;
  height: number;
  /** Bars between two times on the current chart timeframe (for range tools). */
  barsBetween: (t1: number, t2: number) => number;
  pipSize: number;
  digits: number;
}

/** Tools that need two clicks (anchor, then second anchor). */
export const TWO_POINT: DrawingKind[] = ["trend", "rect", "fib", "pricerange", "daterange"];
/** Tools placed with one click. */
export const ONE_POINT: DrawingKind[] = ["hline", "vline", "ray", "text"];

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/** Fibonacci level price: 0 at the second anchor, 1 at the first (TradingView convention). */
export function fibPrice(p1: number, p2: number, level: number): number {
  return p2 + (p1 - p2) * level;
}

export type HitPart = "body" | "p0" | "p1";

export interface Hit {
  id: string;
  part: HitPart;
}

function dashFor(style: Drawing["style"]): number[] {
  return style === "dashed" ? [6, 4] : style === "dotted" ? [2, 3] : [];
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function anchors(d: Drawing, pr: Projector) {
  return d.points.map((q) => ({ x: pr.x(q.t), y: pr.y(q.p) }));
}

const TOL = 6;

/** Topmost drawing (and part) under a point, or null. Projections are handled elsewhere. */
export function hitDrawing(drawings: Drawing[], x: number, y: number, pr: Projector): Hit | null {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (d.kind === "long" || d.kind === "short") continue;
    const a = anchors(d, pr);
    // Handles first (resize).
    if (TWO_POINT.includes(d.kind)) {
      for (const k of [0, 1] as const) {
        const q = a[k];
        if (q && q.x !== null && q.y !== null && Math.hypot(q.x - x, q.y - y) <= TOL + 2) return { id: d.id, part: k === 0 ? "p0" : "p1" };
      }
    }
    const p0 = a[0];
    if (!p0) continue;
    switch (d.kind) {
      case "hline":
        if (p0.y !== null && Math.abs(p0.y - y) <= TOL) return { id: d.id, part: "body" };
        break;
      case "vline":
        if (p0.x !== null && Math.abs(p0.x - x) <= TOL) return { id: d.id, part: "body" };
        break;
      case "ray":
        if (p0.x !== null && p0.y !== null && x >= p0.x - TOL && Math.abs(p0.y - y) <= TOL) return { id: d.id, part: "body" };
        break;
      case "text": {
        if (p0.x === null || p0.y === null) break;
        const w = Math.max(30, (d.text ?? "Text").length * fontSize(d) * 0.6);
        if (x >= p0.x - 4 && x <= p0.x + w + 4 && y >= p0.y - fontSize(d) - 6 && y <= p0.y + 6) return { id: d.id, part: "body" };
        break;
      }
      case "trend": {
        const p1 = a[1];
        if (p0.x === null || p0.y === null || !p1 || p1.x === null || p1.y === null) break;
        if (distToSegment(x, y, p0.x, p0.y, p1.x, p1.y) <= TOL) return { id: d.id, part: "body" };
        break;
      }
      default: {
        // rect, fib, pricerange, daterange — inside the box
        const p1 = a[1];
        if (p0.x === null || p0.y === null || !p1 || p1.x === null || p1.y === null) break;
        const inX = x >= Math.min(p0.x, p1.x) - TOL && x <= Math.max(p0.x, p1.x) + TOL;
        const inY = y >= Math.min(p0.y, p1.y) - TOL && y <= Math.max(p0.y, p1.y) + TOL;
        if (inX && inY) return { id: d.id, part: "body" };
      }
    }
  }
  return null;
}

/**
 * Apply a drag. `from`/`to` are the market coordinates under the pointer at
 * the start of the drag and now; `orig` is the drawing at drag start.
 * `shiftT` moves a time by the number of candles the pointer moved (so a
 * drawing keeps its shape across weekends); without it, times shift by seconds.
 */
export function dragDrawing(orig: Drawing, part: HitPart, from: { t: number; p: number }, to: { t: number; p: number }, round: (p: number) => number, shiftT?: (t: number) => number): Drawing {
  const dt = to.t - from.t;
  const dp = to.p - from.p;
  const move = (t: number) => (shiftT ? shiftT(t) : t + dt);
  if (part === "p0" || part === "p1") {
    const k = part === "p0" ? 0 : 1;
    return { ...orig, points: orig.points.map((q, i) => (i === k ? { t: to.t, p: round(to.p) } : q)) };
  }
  switch (orig.kind) {
    case "hline":
      return { ...orig, points: [{ t: orig.points[0].t, p: round(orig.points[0].p + dp) }] };
    case "vline":
      return { ...orig, points: [{ t: move(orig.points[0].t), p: orig.points[0].p }] };
    default:
      return { ...orig, points: orig.points.map((q) => ({ t: move(q.t), p: round(q.p + dp) })) };
  }
}

function fontSize(d: Drawing) {
  return d.width === 3 ? 16 : d.width === 2 ? 14 : 12;
}

function alpha(color: string, a: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return color;
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg = "#fff") {
  ctx.font = "500 11px ui-sans-serif, system-ui, -apple-system, sans-serif";
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 9, w, 18, 3);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + 0.5);
  ctx.textAlign = "left";
}

export function renderDrawing(ctx: CanvasRenderingContext2D, d: Drawing, pr: Projector, opts: { selected: boolean; draft: boolean; surface: string; text: string }) {
  const a = anchors(d, pr);
  const p0 = a[0];
  if (!p0) return;
  const w = d.width ?? 1;
  ctx.save();
  ctx.strokeStyle = d.color;
  ctx.fillStyle = d.color;
  ctx.lineWidth = opts.selected ? w + 0.5 : w;
  ctx.setLineDash(opts.draft ? [5, 4] : dashFor(d.style));
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const p1 = a[1];
  const both = p0.x !== null && p0.y !== null && p1 && p1.x !== null && p1.y !== null;
  switch (d.kind) {
    case "hline":
      if (p0.y === null) break;
      line(0, p0.y, pr.width, p0.y);
      if (d.label || d.text) {
        ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(d.label ?? d.text ?? "", 8, p0.y - 5);
      }
      break;
    case "vline":
      if (p0.x === null) break;
      line(p0.x, 0, p0.x, pr.height);
      break;
    case "ray":
      if (p0.x === null || p0.y === null) break;
      line(p0.x, p0.y, pr.width, p0.y);
      break;
    case "text":
      if (p0.x === null || p0.y === null) break;
      ctx.font = `600 ${fontSize(d)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(d.text || "Text", p0.x, p0.y);
      break;
    case "trend":
      if (both) line(p0.x!, p0.y!, p1!.x!, p1!.y!);
      break;
    case "rect":
      if (!both) break;
      ctx.fillStyle = alpha(d.color, 0.12);
      ctx.fillRect(Math.min(p0.x!, p1!.x!), Math.min(p0.y!, p1!.y!), Math.abs(p1!.x! - p0.x!), Math.abs(p1!.y! - p0.y!));
      ctx.strokeRect(Math.min(p0.x!, p1!.x!), Math.min(p0.y!, p1!.y!), Math.abs(p1!.x! - p0.x!), Math.abs(p1!.y! - p0.y!));
      break;
    case "fib": {
      if (!both) break;
      const x1 = Math.min(p0.x!, p1!.x!);
      const x2 = Math.max(p0.x!, p1!.x!);
      const [pa, pb] = [d.points[0].p, d.points[1].p];
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = 0.6;
      line(p0.x!, p0.y!, p1!.x!, p1!.y!);
      ctx.globalAlpha = 1;
      ctx.setLineDash(dashFor(d.style));
      let prevY: number | null = null;
      FIB_LEVELS.forEach((lv, i) => {
        const price = fibPrice(pa, pb, lv);
        const yy = pr.y(price);
        if (yy === null) return;
        if (prevY !== null) {
          ctx.fillStyle = alpha(d.color, i % 2 ? 0.07 : 0.12);
          ctx.fillRect(x1, Math.min(prevY, yy), x2 - x1, Math.abs(yy - prevY));
        }
        prevY = yy;
        ctx.strokeStyle = d.color;
        line(x1, yy, x2, yy);
        ctx.fillStyle = d.color;
        ctx.font = "500 10.5px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "bottom";
        ctx.fillText(`${lv} (${price.toFixed(pr.digits)})`, x1 + 4, yy - 2);
      });
      break;
    }
    case "pricerange":
    case "daterange": {
      if (!both) break;
      const x1 = Math.min(p0.x!, p1!.x!);
      const x2 = Math.max(p0.x!, p1!.x!);
      const y1 = Math.min(p0.y!, p1!.y!);
      const y2 = Math.max(p0.y!, p1!.y!);
      const up = d.points[1].p >= d.points[0].p;
      const fill = d.kind === "pricerange" ? (up ? "#089981" : "#f23645") : d.color;
      ctx.fillStyle = alpha(fill, 0.12);
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeStyle = fill;
      ctx.setLineDash([]);
      if (d.kind === "pricerange") {
        const cx = (x1 + x2) / 2;
        line(cx, p0.y!, cx, p1!.y!);
        line(x1, p0.y!, x2, p0.y!);
        line(x1, p1!.y!, x2, p1!.y!);
        const dpx = d.points[1].p - d.points[0].p;
        const pct = (dpx / d.points[0].p) * 100;
        const bars = Math.abs(pr.barsBetween(d.points[0].t, d.points[1].t));
        label(ctx, `${dpx >= 0 ? "+" : "−"}${Math.abs(dpx).toFixed(pr.digits)} (${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%) · ${(Math.abs(dpx) / pr.pipSize).toFixed(1)} pips · ${bars} bars`, cx, up ? y1 - 12 : y2 + 12, fill);
      } else {
        const cy = (y1 + y2) / 2;
        line(p0.x!, cy, p1!.x!, cy);
        line(p0.x!, y1, p0.x!, y2);
        line(p1!.x!, y1, p1!.x!, y2);
        const bars = Math.abs(pr.barsBetween(d.points[0].t, d.points[1].t));
        label(ctx, `${bars} bars · ${formatDuration(Math.abs(d.points[1].t - d.points[0].t))}`, (x1 + x2) / 2, y2 + 12, d.color);
      }
      break;
    }
  }
  if (opts.selected) {
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = d.locked ? opts.text : d.color;
    ctx.fillStyle = opts.surface;
    for (const q of TWO_POINT.includes(d.kind) ? a : [p0]) {
      if (!q || q.x === null || q.y === null) continue;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (d.locked && p0.x !== null && p0.y !== null) {
      // Small padlock next to the first anchor.
      const lx = p0.x + 8;
      const ly = p0.y - 14;
      ctx.strokeStyle = opts.text;
      ctx.fillStyle = opts.text;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(lx + 4, ly + 4, 2.6, Math.PI, 0);
      ctx.stroke();
      ctx.fillRect(lx, ly + 4, 8, 6);
    }
  }
  ctx.restore();
}
