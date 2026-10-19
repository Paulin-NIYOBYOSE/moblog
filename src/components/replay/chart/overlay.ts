import type {
  AutoscaleInfo,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { Drawing, Side } from "@/lib/replay/types";
import { renderDrawing, type Projector } from "./drawings";

// Canvas overlay drawn by the chart itself (series primitive), so position
// boxes, trade pills and drawings stay pinned to price/time coordinates through
// zoom, scroll and resize. The look follows TradingView's Long/Short Position
// tool and trading lines, which FX Replay is built on.

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/** TradingView palette for candles, position zones and trade lines. */
export const TV = {
  up: "#089981",
  down: "#f23645",
  stop: "#ff9800",
  neutral: "#787b86",
  order: "#2962ff",
} as const;

export type DragTarget =
  | { kind: "position"; id: string; field: "sl" | "tp" }
  | { kind: "order"; id: string; field: "price" | "sl" | "tp" }
  | { kind: "preview"; field: "entry" | "sl" | "tp" }
  | { kind: "projection"; id: string; field: "entry" | "sl" | "tp" | "end" }
  | { kind: "drawing"; id: string; field: "body" | "p0" | "p1" };

export type OverlayAction =
  | { type: "close-position"; id: string }
  | { type: "remove-level"; owner: "position" | "order"; id: string; field: "sl" | "tp" }
  | { type: "cancel-order"; id: string }
  | { type: "place-projection"; id: string }
  | { type: "delete-drawing"; id: string };

/** A clickable or draggable area recorded during the last paint. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  cursor: string;
  action?: OverlayAction;
  drag?: DragTarget;
}

export interface Box {
  id: string;
  kind: "open" | "pending" | "preview" | "closed" | "projection";
  side: Side;
  fromT: number;
  /** null → extends a few bars past the replay edge. */
  toT: number | null;
  entry: number;
  sl: number | null;
  tp: number | null;
  exitPrice?: number;
  targetLabel?: string;
  stopLabel?: string;
  centerLabel?: string;
  /** Background of the centre label (P&L colour for open positions). */
  centerColor?: string;
  selected?: boolean;
}

export interface Pill {
  text: string;
  color: string;
  /** Dashed outline "ghost" pill (drag to add SL/TP). */
  ghost?: boolean;
  close?: OverlayAction;
  drag?: DragTarget;
}

/** Pills drawn right-aligned on one price level, left → right. */
export interface PillRow {
  price: number;
  pills: Pill[];
}

export interface OverlayColors {
  profit: string;
  loss: string;
  accent: string;
  text: string;
  muted: string;
  surface: string;
}

export interface OverlayState {
  boxes: Box[];
  pills: PillRow[];
  drawings: Drawing[];
  draft: Drawing | null;
  selectedId: string | null;
  hideDrawings: boolean;
  /** Trading-session background bands (x ranges in pixels). */
  sessionBands: { x0: number; x1: number; color: string }[];
  barsBetween: (t1: number, t2: number) => number;
  pipSize: number;
  digits: number;
  /** Open time of the last revealed chart candle. */
  edgeT: number | null;
  colors: OverlayColors;
  timeToX: (t: number) => number | null;
  barSpacing: () => number;
}

function alpha(color: string, a: number): string {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4 ? color.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : color;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return color;
}

const FONT = "500 11px ui-sans-serif, system-ui, -apple-system, sans-serif";
const PILL_FONT = "600 10.5px ui-sans-serif, system-ui, -apple-system, sans-serif";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Label box centred on `cx`; `vy` is the edge it attaches to, `dir` −1 above / +1 below / 0 centred. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, vy: number, dir: -1 | 0 | 1, bg: string) {
  ctx.font = FONT;
  const w = ctx.measureText(text).width + 12;
  const h = 18;
  const x = cx - w / 2;
  const y = dir === -1 ? vy - h - 3 : dir === 1 ? vy + 3 : vy - h / 2;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 6, y + h / 2 + 0.5);
  return { x, y, w, h };
}

class Renderer implements IPrimitivePaneRenderer {
  constructor(
    private owner: ChartOverlay,
    private layer: "bottom" | "top",
  ) {}

  draw(target: Target) {
    const st = this.owner.state;
    const series = this.owner.series;
    if (!st || !series) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const y = (p: number) => series.priceToCoordinate(p);
      if (this.layer === "bottom") this.drawBottom(ctx, mediaSize, st, y);
      else {
        this.owner.regions = [];
        this.drawTop(ctx, mediaSize, st, y);
      }
    });
  }

  private edgeX(st: OverlayState): number | null {
    if (st.edgeT === null) return null;
    const x = st.timeToX(st.edgeT);
    return x === null ? null : x + st.barSpacing() / 2;
  }

  /** Pixel rectangle of a box, or null when off-scale. */
  private boxGeom(b: Box, st: OverlayState, y: (p: number) => number | null) {
    const edge = this.edgeX(st);
    const yE = y(b.entry);
    const x1 = st.timeToX(b.fromT);
    if (yE === null || x1 === null) return null;
    let x2 = b.toT !== null ? st.timeToX(b.toT) : edge !== null ? edge + st.barSpacing() * 6 : null;
    if (x2 === null) x2 = x1 + st.barSpacing() * 8;
    if (b.kind !== "closed" && b.kind !== "projection") x2 = Math.max(x2, x1 + st.barSpacing() * 10);
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2, left + 4);
    return { left, right, yE, yS: b.sl !== null ? y(b.sl) : null, yT: b.tp !== null ? y(b.tp) : null };
  }

  private drawBottom(ctx: CanvasRenderingContext2D, size: { width: number; height: number }, st: OverlayState, y: (p: number) => number | null) {
    for (const band of st.sessionBands) {
      ctx.fillStyle = band.color;
      ctx.fillRect(band.x0, 0, band.x1 - band.x0, size.height);
    }
    const edge = this.edgeX(st);
    // Unrevealed future: tinted and labelled so it's never mistaken for data.
    if (edge !== null && edge < size.width) {
      ctx.save();
      ctx.fillStyle = alpha(st.colors.muted, 0.06);
      ctx.fillRect(edge, 0, size.width - edge, size.height);
      ctx.strokeStyle = alpha(st.colors.accent, 0.55);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(edge) + 0.5, 0);
      ctx.lineTo(Math.round(edge) + 0.5, size.height);
      ctx.stroke();
      ctx.setLineDash([]);
      if (size.width - edge > 70) {
        ctx.fillStyle = alpha(st.colors.muted, 0.9);
        ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText("UNREVEALED", edge + 8, 16);
      }
      ctx.restore();
    }

    for (const b of st.boxes) {
      if (st.hideDrawings && b.kind === "projection") continue;
      const g = this.boxGeom(b, st, y);
      if (!g) continue;
      const w = g.right - g.left;
      const a = b.kind === "closed" ? 0.09 : b.kind === "preview" ? 0.14 : 0.2;
      if (g.yT !== null) {
        ctx.fillStyle = alpha(TV.up, a);
        ctx.fillRect(g.left, Math.min(g.yE, g.yT), w, Math.abs(g.yT - g.yE));
      }
      if (g.yS !== null) {
        ctx.fillStyle = alpha(TV.down, a);
        ctx.fillRect(g.left, Math.min(g.yE, g.yS), w, Math.abs(g.yS - g.yE));
      }
      if (b.kind !== "closed") {
        ctx.strokeStyle = alpha(st.colors.text, b.kind === "preview" ? 0.35 : 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(g.left, Math.round(g.yE) + 0.5);
        ctx.lineTo(g.right, Math.round(g.yE) + 0.5);
        ctx.stroke();
      }
      if (b.kind === "closed" && b.exitPrice !== undefined && b.toT !== null) {
        const yX = y(b.exitPrice);
        if (yX !== null) {
          ctx.save();
          ctx.strokeStyle = alpha(st.colors.text, 0.45);
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(g.left, g.yE);
          ctx.lineTo(g.right, yX);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  private drawTop(ctx: CanvasRenderingContext2D, size: { width: number; height: number }, st: OverlayState, y: (p: number) => number | null) {
    const regions = this.owner.regions;
    this.drawDrawings(ctx, size, st, y);

    // Position-box labels and projection handles.
    for (const b of st.boxes) {
      if (b.kind === "closed") continue;
      if (st.hideDrawings && b.kind === "projection") continue;
      const g = this.boxGeom(b, st, y);
      if (!g) continue;
      const cx = (g.left + g.right) / 2;
      const up = b.side === "buy";
      ctx.save();
      if (b.targetLabel && g.yT !== null) drawLabel(ctx, b.targetLabel, cx, g.yT, up ? -1 : 1, TV.up);
      if (b.stopLabel && g.yS !== null) drawLabel(ctx, b.stopLabel, cx, g.yS, up ? 1 : -1, TV.down);
      let center: { x: number; y: number; w: number; h: number } | null = null;
      if (b.centerLabel) center = drawLabel(ctx, b.centerLabel, cx, g.yE, 0, b.centerColor ?? TV.neutral);
      ctx.restore();

      if (b.kind === "projection") {
        const top = Math.min(g.yE, g.yT ?? g.yE, g.yS ?? g.yE);
        const bottom = Math.max(g.yE, g.yT ?? g.yE, g.yS ?? g.yE);
        // Drag zones: target edge, stop edge, entry line (moves the box), right edge (width).
        if (g.yT !== null) regions.push({ x: g.left, y: g.yT - 4, w: g.right - g.left, h: 8, cursor: "ns-resize", drag: { kind: "projection", id: b.id, field: "tp" } });
        if (g.yS !== null) regions.push({ x: g.left, y: g.yS - 4, w: g.right - g.left, h: 8, cursor: "ns-resize", drag: { kind: "projection", id: b.id, field: "sl" } });
        regions.push({ x: g.right - 4, y: top, w: 8, h: bottom - top, cursor: "ew-resize", drag: { kind: "projection", id: b.id, field: "end" } });
        regions.push({ x: g.left, y: g.yE - 5, w: g.right - g.left, h: 10, cursor: "move", drag: { kind: "projection", id: b.id, field: "entry" } });
        if (b.selected) {
          ctx.save();
          ctx.fillStyle = st.colors.surface;
          ctx.strokeStyle = st.colors.accent;
          ctx.lineWidth = 1.5;
          const handle = (hx: number, hy: number) => {
            ctx.fillRect(hx - 4, hy - 4, 8, 8);
            ctx.strokeRect(hx - 4, hy - 4, 8, 8);
          };
          handle(g.left, g.yE);
          if (g.yT !== null) handle(g.left, g.yT);
          if (g.yS !== null) handle(g.left, g.yS);
          handle(g.right, g.yE);
          ctx.restore();
          // "Place order" and delete buttons under the centre label.
          if (center) {
            const by = center.y + center.h + 4;
            ctx.save();
            ctx.font = PILL_FONT;
            const label = "Place order";
            const pw = ctx.measureText(label).width + 16;
            const px = cx - (pw + 24) / 2;
            ctx.fillStyle = up ? TV.up : TV.down;
            roundRect(ctx, px, by, pw, 20, 4);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.textBaseline = "middle";
            ctx.fillText(label, px + 8, by + 10.5);
            regions.push({ x: px, y: by, w: pw, h: 20, cursor: "pointer", action: { type: "place-projection", id: b.id } });
            const dx = px + pw + 4;
            ctx.fillStyle = alpha(st.colors.text, 0.75);
            roundRect(ctx, dx, by, 20, 20, 4);
            ctx.fill();
            ctx.fillStyle = st.colors.surface;
            ctx.fillText("✕", dx + 5.5, by + 10.5);
            regions.push({ x: dx, y: by, w: 20, h: 20, cursor: "pointer", action: { type: "delete-drawing", id: b.id } });
            ctx.restore();
          }
        }
      }
    }

    // Trade pills on the right edge of the pane (TradingView trading lines).
    ctx.save();
    ctx.font = PILL_FONT;
    ctx.textBaseline = "middle";
    for (const row of st.pills) {
      const py = y(row.price);
      if (py === null || py < -10 || py > size.height + 10) continue;
      let x = size.width - 8;
      const h = 18;
      const top = py - h / 2;
      for (let i = row.pills.length - 1; i >= 0; i--) {
        const p = row.pills[i];
        const tw = ctx.measureText(p.text).width;
        const closeW = p.close ? 18 : 0;
        const w = tw + 12 + closeW;
        x -= w;
        if (p.ghost) {
          ctx.fillStyle = st.colors.surface;
          roundRect(ctx, x, top, w, h, 3);
          ctx.fill();
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = p.color;
        } else {
          ctx.fillStyle = p.color;
          roundRect(ctx, x, top, w, h, 3);
          ctx.fill();
          ctx.fillStyle = "#fff";
        }
        ctx.fillText(p.text, x + 6, py + 0.5);
        if (p.drag) regions.push({ x, y: top, w: w - closeW, h, cursor: "ns-resize", drag: p.drag });
        if (p.close) {
          const cx0 = x + w - closeW;
          ctx.fillStyle = p.ghost ? p.color : "rgba(255,255,255,0.9)";
          ctx.fillRect(cx0, top + 4, 1, h - 8);
          ctx.fillText("✕", cx0 + 4, py + 0.5);
          regions.push({ x: cx0, y: top, w: closeW, h, cursor: "pointer", action: p.close });
        }
        x -= 4;
      }
    }
    ctx.restore();
  }

  private drawDrawings(ctx: CanvasRenderingContext2D, size: { width: number; height: number }, st: OverlayState, y: (p: number) => number | null) {
    if (st.hideDrawings) return;
    const pr: Projector = { x: st.timeToX, y, width: size.width, height: size.height, barsBetween: st.barsBetween, pipSize: st.pipSize, digits: st.digits };
    const all = st.draft ? [...st.drawings, st.draft] : st.drawings;
    for (const d of all) {
      if (d.kind === "long" || d.kind === "short") continue; // rendered as boxes
      renderDrawing(ctx, d, pr, { selected: d.id === st.selectedId, draft: d === st.draft, surface: st.colors.surface, text: st.colors.text });
    }
  }
}

class View implements IPrimitivePaneView {
  private r: Renderer;
  constructor(
    owner: ChartOverlay,
    private layer: "bottom" | "top",
  ) {
    this.r = new Renderer(owner, layer);
  }
  zOrder(): PrimitivePaneViewZOrder {
    return this.layer;
  }
  renderer() {
    return this.r;
  }
}

export class ChartOverlay implements ISeriesPrimitive<Time> {
  state: OverlayState | null = null;
  series: ISeriesApi<SeriesType, Time> | null = null;
  /** Hit regions from the last paint, in pane (container) coordinates. */
  regions: Region[] = [];
  private requestUpdate: (() => void) | null = null;
  private views: readonly IPrimitivePaneView[];

  constructor() {
    this.views = [new View(this, "bottom"), new View(this, "top")];
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.series = null;
    this.requestUpdate = null;
  }

  paneViews() {
    return this.views;
  }

  /** Keep entry / stop / target of live trades, projections and the preview in view. */
  autoscaleInfo(): AutoscaleInfo | null {
    const st = this.state;
    if (!st) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const b of st.boxes) {
      if (b.kind === "closed") continue;
      for (const p of [b.entry, b.sl, b.tp]) {
        if (p === null || !Number.isFinite(p)) continue;
        if (p < min) min = p;
        if (p > max) max = p;
      }
    }
    if (!Number.isFinite(min)) return null;
    return { priceRange: { minValue: min, maxValue: max } };
  }

  /** Topmost region under a point (later-drawn regions win). */
  hit(x: number, y: number): Region | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  update(state: OverlayState) {
    this.state = state;
    this.requestUpdate?.();
  }
}

/** Distance from point p to segment ab (pixels). */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
