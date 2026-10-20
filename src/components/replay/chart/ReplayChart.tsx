"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ChevronsRight, Eye, EyeOff, Settings2, X } from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Logical,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ChartBar } from "@/lib/replay/aggregate";
import type { ControllerSnapshot, ReplayController } from "@/lib/replay/controller";
import { labelOf } from "@/lib/replay/engine";
import { atr, bollinger, ema, macd, rsi, sma } from "@/lib/replay/indicators";
import { levelStats, rewardRisk, signedMoney, signedPct } from "@/lib/replay/positionMath";
import { computeSizing } from "@/lib/replay/sizing";
import { formatInTz, marketSessionOf, TF_SECONDS } from "@/lib/replay/time";
import type { Drawing, IndicatorConfig, Side } from "@/lib/replay/types";
import { useTheme } from "@/components/ThemeContext";
import { ChartOverlay, TV, type AxisLabel, type Box, type DragTarget, type OverlayAction, type OverlayColors, type Pill, type PillRow, type TimeMark } from "./overlay";
import { newProjection, projectionLevels, withLevels } from "./projection";
import { dragDrawing, hitDrawing, ONE_POINT, TWO_POINT, type HitPart, type Projector } from "./drawings";
import { riskBase } from "../workstation/ticket";
import { showsContext } from "@/lib/replay/history";
import { indicatorTitle } from "../workstation/IndicatorsDialog";
import { TF_SHORT } from "../workstation/ChartTopBar";
import { cn } from "@/lib/utils";

/** Candle colours (bright, terminal style). Position zones keep TradingView's palette. */
export const CANDLE = { up: "#26c17a", down: "#ef4f4f" } as const;

export type { DragTarget, OverlayAction } from "./overlay";
export type DrawTool = "cursor" | "crosshair" | "hline" | "vline" | "ray" | "trend" | "rect" | "fib" | "text" | "pricerange" | "daterange" | "long" | "short";

/** Tools that select and drag rather than create. */
export const isIdleTool = (t: DrawTool) => t === "cursor" || t === "crosshair";
export type PickTarget = "entry" | "sl" | "tp";

export interface TicketPreview {
  side: Side;
  /** null = market order at the current price. */
  entry: number | null;
  sl: number | null;
  tp: number | null;
  lots: number;
  /** Time span of the position drawing it came from (else it starts at the replay point). */
  fromT?: number;
  toT?: number;
}

export interface ChartContextEvent {
  clientX: number;
  clientY: number;
  price: number;
  t: number;
  /** Set when the right-click landed on a drawing. */
  drawingId?: string;
}

export interface ChartHandle {
  screenshot: () => string | null;
  resetView: () => void;
  bars: () => ChartBar[];
  /** Show the last `days` of revealed candles. */
  setVisibleDays: (days: number) => void;
  setScaleMode: (mode: "normal" | "percent" | "log") => void;
  setAutoScale: (on: boolean) => void;
  zoomIn: () => void;
}

interface Props {
  controller: ReplayController;
  snap: ControllerSnapshot;
  tool: DrawTool;
  drawColor: string;
  onToolDone: () => void;
  pick: PickTarget | null;
  onPick: (target: PickTarget, price: number) => void;
  preview: TicketPreview | null;
  onDrag: (target: DragTarget, price: number) => void;
  onAction: (action: OverlayAction) => void;
  onContextMenu: (e: ChartContextEvent) => void;
  /** Every drawing change goes through here (the workstation keeps undo history). */
  onDrawingsChange: (next: Drawing[]) => void;
  hideDrawings: boolean;
  sessionShading: boolean;
  /** Keep the newest revealed candle in view while stepping. */
  autoScroll: boolean;
  /** The price axis's auto-scale changed (e.g. the user zoomed it by hand). */
  onAutoScaleChange?: (on: boolean) => void;
  /** Snap drawing points to the candle's open/high/low/close. */
  magnet: boolean;
  /** Draw closed trades' entry/stop/target zones (off = TradingView-clean chart). */
  pastTrades: boolean;
  /** Text on trade markers ("Buy 0.50", "TP +2.0R"); off = arrows only. */
  tradeLabels: boolean;
  /** Drawings can be selected but not moved or reshaped. */
  lockAll: boolean;
  /** Drawing temporarily replaced by the order preview (being turned into an order). */
  hiddenDrawingId?: string | null;
  /** A Long/Short position drawing was just placed. */
  onProjectionPlaced?: (id: string) => void;
  /** TradingView-style SELL / BUY buttons in the legend. */
  onQuickTrade?: (side: Side) => void;
  onIndicatorsChange?: (next: IndicatorConfig[]) => void;
  onOpenIndicators?: () => void;
  selectedDrawingId: string | null;
  onSelectDrawing: (id: string | null) => void;
  handleRef?: Ref<ChartHandle>;
}

interface DragState {
  key: string;
  target: DragTarget;
  price: number;
  /** Projection or drawing being reshaped (original and live copy). */
  orig?: Drawing;
  proj?: Drawing;
  /** Drawing drags: part and the market point under the pointer at start. */
  part?: HitPart;
  from?: { t: number; p: number };
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function readColors(): OverlayColors & { grid: string; axis: string; background: string; border: string } {
  return {
    font: typeof document === "undefined" ? "" : getComputedStyle(document.body).fontFamily,
    profit: TV.up,
    loss: TV.down,
    accent: cssVar("--accent", "#5e4ff2"),
    text: cssVar("--foreground", "#0c0d10"),
    muted: cssVar("--muted", "#696d78"),
    surface: cssVar("--card", "#ffffff"),
    grid: cssVar("--chart-grid", "#eceae4"),
    axis: cssVar("--chart-axis", "#cfcdc5"),
    background: cssVar("--card", "#ffffff"),
    border: cssVar("--border", "#e6e5df"),
  };
}

function withAlpha(hex: string, a: number) {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function toCandle(b: ChartBar): CandlestickData<Time> {
  const c: CandlestickData<Time> = { time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close };
  if (b.forming) {
    // The candle still forming at the replay point is drawn translucent so it
    // reads as incomplete, never as a finished bar.
    const base = b.close >= b.open ? CANDLE.up : CANDLE.down;
    c.color = withAlpha(base, 0.35);
    c.wickColor = withAlpha(base, 0.6);
    c.borderColor = base;
  }
  return c;
}

/** Largest index i with bars[i].time <= t (-1 if none). */
function barIndexAt(bars: ChartBar[], t: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

interface IndicatorSeries {
  cfg: IndicatorConfig;
  series: ISeriesApi<"Line" | "Histogram">[];
}

const isProjection = (d: Drawing) => d.kind === "long" || d.kind === "short";

export default function ReplayChart(props: Props) {
  const { controller, snap } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayRef = useRef<ChartOverlay | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const barsRef = useRef<ChartBar[]>([]);
  const epochRef = useRef<number>(-1);
  const tfRef = useRef(snap.session.timeframe);
  const linesRef = useRef<Map<string, { line: IPriceLine; target: DragTarget; price: number }>>(new Map());
  const indicatorsRef = useRef<IndicatorSeries[]>([]);
  const dragRef = useRef<DragState | null>(null);
  /** Position tool under the pointer — its labels show on hover, like TradingView. */
  const hoverRef = useRef<string | null>(null);
  /** Trade-line row under the pointer — compact pills expand (and ghosts show) on hover. */
  const pillHoverRef = useRef<string | null>(null);
  const draftRef = useRef<Drawing | null>(null);
  const propsRef = useRef(props);
  const colorsRef = useRef(readColors());
  const tzRef = useRef(snap.session.displayTimezone);
  const digits = snap.spec.digits;
  const { resolvedTheme } = useTheme();
  /** Is the latest revealed candle on screen? (drives "Go to replay point") */
  const [edgeVisible, setEdgeVisible] = useState(true);

  useEffect(() => {
    propsRef.current = props;
  });
  useEffect(() => {
    tzRef.current = snap.session.displayTimezone;
    chartRef.current?.applyOptions({});
  }, [snap.session.displayTimezone]);

  const timeToLogical = useCallback((t: number): number | null => {
    const bars = barsRef.current;
    if (!bars.length) return null;
    const n = bars.length;
    const tf = TF_SECONDS[tfRef.current];
    if (t > bars[n - 1].time + tf - 1) return n - 1 + (t - bars[n - 1].time) / tf;
    if (t < bars[0].time) return (t - bars[0].time) / tf;
    return barIndexAt(bars, t);
  }, []);

  const logicalToTime = useCallback((logical: number): number | null => {
    const bars = barsRef.current;
    if (!bars.length) return null;
    const i = Math.round(logical);
    const n = bars.length;
    const tf = TF_SECONDS[tfRef.current];
    if (i >= 0 && i < n) return bars[i].time;
    if (i >= n) return bars[n - 1].time + (i - (n - 1)) * tf;
    return bars[0].time + i * tf;
  }, []);

  const timeToX = useCallback(
    (t: number): number | null => {
      const chart = chartRef.current;
      const logical = timeToLogical(t);
      if (!chart || logical === null) return null;
      return chart.timeScale().logicalToCoordinate(logical as Logical);
    },
    [timeToLogical],
  );

  const roundPrice = useCallback((p: number) => +p.toFixed(digits), [digits]);

  /** Pixel projector for drawing hit-tests (main pane). */
  const projector = useCallback((): Projector | null => {
    const series = seriesRef.current;
    const el = containerRef.current;
    if (!series || !el) return null;
    return {
      x: timeToX,
      y: (p: number) => series.priceToCoordinate(p),
      width: el.clientWidth,
      height: el.clientHeight,
      barsBetween: () => 0,
      pipSize: propsRef.current.snap.spec.pipSize,
      digits,
    };
  }, [timeToX, digits]);

  // -------------------------------------------------------------------------
  // Overlay: position boxes, trade pills, projections, drawings
  // -------------------------------------------------------------------------

  const renderOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const chart = chartRef.current;
    if (!overlay || !chart) return;
    const p = propsRef.current;
    const s = p.snap;
    const set = s.session.settings;
    const ccy = set.accountCurrency;
    const spec = s.spec;
    const d = spec.digits;
    const drag = dragRef.current;
    const override = (target: DragTarget, value: number | null) => {
      if (!drag) return value;
      const a = drag.target;
      if (a.kind !== target.kind || a.field !== target.field) return value;
      if ("id" in a && "id" in target && a.id !== target.id) return value;
      return drag.price;
    };
    const stat = (side: Side, entry: number, level: number, lots: number) =>
      levelStats({ side, entry, level, lots, spec, accountCurrency: ccy, conversionRate: set.conversionRate, balance: s.balance });
    // TradingView position-tool labels: "Target: 0.00250 (0.23%) 25.0 pips, Amount: $250.00".
    const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: ccy });
    const levelText = (kind: "Target" | "Stop", side: Side, entry: number, level: number, lots: number) => {
      const st = stat(side, entry, level, lots);
      return `${kind}: ${Math.abs(level - entry).toFixed(d)} (${st.pricePct.toFixed(2)}%) ${st.pips.toFixed(1)} pips, Amount: ${amount.format(Math.abs(st.money))}`;
    };
    const labels = (side: Side, entry: number, sl: number | null, tp: number | null, lots: number) => ({
      targetLabel: tp !== null ? levelText("Target", side, entry, tp, lots) : undefined,
      stopLabel: sl !== null ? levelText("Stop", side, entry, sl, lots) : undefined,
    });
    /** Centre label: open P&L at the current price, size and reward:risk. */
    const centre = (side: Side, entry: number, sl: number | null, tp: number | null, lots: number) => {
      const exitPx = side === "buy" ? s.quote.bid : s.quote.ask;
      const open = stat(side, entry, exitPx, lots).money;
      const ratio = rewardRisk(entry, sl, tp);
      return {
        centerLabel: `Open P&L: ${signedMoney(open, ccy)}, Qty: ${lots > 0 ? lots.toFixed(2) : "—"} lots\nRisk/Reward Ratio: ${ratio !== null ? +ratio.toFixed(2) : "—"}`,
        centerColor: open >= 0 ? TV.up : TV.down,
      };
    };
    const rr = (entry: number, sl: number | null, tp: number | null) => {
      const v = rewardRisk(entry, sl, tp);
      return v === null ? "" : ` · R:R ${v.toFixed(2)}`;
    };
    const pct = (money: number) => (s.balance > 0 ? (money / s.balance) * 100 : null);

    const boxes: Box[] = [];
    const pills: PillRow[] = [];
    // Trade lines stay compact (TradingView-clean); hovering a line shows pips, % and R:R.
    const hot = (key: string) => pillHoverRef.current === key;
    // Pills for a stop/target level, with ✕ to remove it.
    const levelPill = (owner: "position" | "order", id: string, side: Side, entry: number, field: "sl" | "tp", level: number, lots: number): PillRow => {
      const st = stat(side, entry, level, lots);
      const key = `${owner}:${id}:${field}`;
      const tag = field === "sl" ? "SL" : "TP";
      return {
        price: level,
        key,
        pills: [
          {
            text: hot(key) ? `${tag}  ${st.money >= 0 ? "+" : "−"}${st.pips.toFixed(1)} pips  ${signedMoney(st.money, ccy)}  ${signedPct(st.accountPct)}` : `${tag}  ${signedMoney(st.money, ccy)}`,
            color: field === "sl" ? TV.stop : TV.up,
            close: { type: "remove-level", owner, id, field },
          },
        ],
      };
    };
    const ghosts = (owner: "position" | "order", id: string, sl: number | null, tp: number | null): Pill[] => {
      const out: Pill[] = [];
      if (sl === null) out.push({ text: "+ SL", color: TV.stop, ghost: true, drag: owner === "position" ? { kind: "position", id, field: "sl" } : { kind: "order", id, field: "sl" } });
      if (tp === null) out.push({ text: "+ TP", color: TV.up, ghost: true, drag: owner === "position" ? { kind: "position", id, field: "tp" } : { kind: "order", id, field: "tp" } });
      return out;
    };

    if (p.pastTrades) {
      for (const t of s.trades.slice(-60)) {
        boxes.push({ id: t.id, kind: "closed", side: t.side, fromT: t.entryT, toT: t.exitT, entry: t.entryPrice, sl: t.initialSl, tp: t.initialTp, exitPrice: t.exitPrice });
      }
    }

    for (const pos of s.positions) {
      const sl = override({ kind: "position", id: pos.id, field: "sl" }, pos.sl);
      const tp = override({ kind: "position", id: pos.id, field: "tp" }, pos.tp);
      const pnl = s.positionPnl[pos.id]?.unrealized ?? 0;
      const exitPx = pos.side === "buy" ? s.quote.bid : s.quote.ask;
      const openPips = ((exitPx - pos.entryPrice) * (pos.side === "buy" ? 1 : -1)) / spec.pipSize;
      // Live trades: zones only — the pills on the right carry pips, money and %.
      boxes.push({ id: pos.id, kind: "open", side: pos.side, fromT: pos.entryT, toT: null, entry: pos.entryPrice, sl, tp });
      const key = `position:${pos.id}:entry`;
      const tag = `${pos.side === "buy" ? "LONG" : "SHORT"} ${pos.lots.toFixed(2)}`;
      pills.push({
        price: pos.entryPrice,
        key,
        pills: [
          ...(hot(key) ? ghosts("position", pos.id, sl, tp) : []),
          {
            text: hot(key) ? `${tag}  ${openPips >= 0 ? "+" : "−"}${Math.abs(openPips).toFixed(1)} pips  ${signedMoney(pnl, ccy)}  ${signedPct(pct(pnl))}${rr(pos.entryPrice, sl, tp)}` : `${tag}  ${signedMoney(pnl, ccy)}`,
            color: pos.side === "buy" ? TV.up : TV.down,
            close: { type: "close-position", id: pos.id },
          },
        ],
      });
      if (sl !== null) pills.push(levelPill("position", pos.id, pos.side, pos.entryPrice, "sl", sl, pos.lots));
      if (tp !== null) pills.push(levelPill("position", pos.id, pos.side, pos.entryPrice, "tp", tp, pos.lots));
    }

    for (const o of s.orders) {
      const price = override({ kind: "order", id: o.id, field: "price" }, o.price) as number;
      const sl = override({ kind: "order", id: o.id, field: "sl" }, o.sl);
      const tp = override({ kind: "order", id: o.id, field: "tp" }, o.tp);
      const side: Side = o.type.startsWith("buy") ? "buy" : "sell";
      boxes.push({ id: o.id, kind: "pending", side, fromT: o.createdAt, toT: null, entry: price, sl, tp });
      const key = `order:${o.id}:entry`;
      const tag = `${labelOf(o.type).toUpperCase()} ${o.lots.toFixed(2)}`;
      pills.push({
        price,
        key,
        pills: [
          ...(hot(key) ? ghosts("order", o.id, sl, tp) : []),
          { text: hot(key) ? `${tag} @ ${price.toFixed(d)}${rr(price, sl, tp)}` : tag, color: TV.order, close: { type: "cancel-order", id: o.id } },
        ],
      });
      if (sl !== null) pills.push(levelPill("order", o.id, side, price, "sl", sl, o.lots));
      if (tp !== null) pills.push(levelPill("order", o.id, side, price, "tp", tp, o.lots));
    }

    if (p.preview) {
      const pv = p.preview;
      const entry = override({ kind: "preview", field: "entry" }, pv.entry) ?? (pv.side === "buy" ? s.quote.ask : s.quote.bid);
      const sl = override({ kind: "preview", field: "sl" }, pv.sl);
      const tp = override({ kind: "preview", field: "tp" }, pv.tp);
      boxes.push({
        id: "preview",
        kind: "preview",
        side: pv.side,
        fromT: pv.fromT ?? s.cursorT,
        toT: pv.toT ?? null,
        entry,
        sl,
        tp,
        ...labels(pv.side, entry, sl, tp, pv.lots),
        ...centre(pv.side, entry, sl, tp, pv.lots),
      });
    }

    const drawings: Drawing[] = [];
    for (const raw of s.session.drawings) {
      if (raw.id === p.hiddenDrawingId) continue;
      const dr = drag?.proj && drag.proj.id === raw.id ? drag.proj : raw;
      if (p.hideDrawings && isProjection(dr)) continue;
      drawings.push(dr);
      if (!isProjection(dr)) continue;
      const lv = projectionLevels(dr);
      const lots = computeSizing({
        mode: set.riskMode,
        side: lv.side,
        equity: riskBase(s),
        riskPercent: set.riskPercent,
        riskMoney: set.riskMoney,
        fixedLots: set.fixedLots,
        entry: lv.entry,
        sl: lv.sl,
        tp: lv.tp,
        spec,
        accountCurrency: ccy,
        conversionRate: set.conversionRate,
      }).lots;
      const selected = dr.id === p.selectedDrawingId;
      const hovered = dr.id === hoverRef.current || drag?.proj?.id === dr.id;
      // TradingView-clean: zones only, until the tool is hovered or selected.
      boxes.push({
        id: dr.id,
        kind: "projection",
        side: lv.side,
        fromT: lv.fromT,
        toT: lv.toT,
        entry: lv.entry,
        sl: lv.sl,
        tp: lv.tp,
        ...(selected || hovered ? { ...labels(lv.side, lv.entry, lv.sl, lv.tp, lots), ...centre(lv.side, lv.entry, lv.sl, lv.tp, lots) } : {}),
        selected,
        hovered,
      });
    }

    // Price/time-scale labels: horizontal lines always, the selected drawing's points and span.
    const tz = s.session.displayTimezone;
    const stamp = (t: number) => `${formatInTz(t, tz, "tick-day")} '${formatInTz(t, tz, "month").slice(-2)}  ${formatInTz(t, tz, "time")}`;
    const axisLabels: AxisLabel[] = [];
    let timeSpan: { from: TimeMark; to: TimeMark | null } | null = null;
    if (!p.hideDrawings) {
      for (const dr of drawings) if (dr.kind === "hline") axisLabels.push({ price: dr.points[0].p, text: dr.points[0].p.toFixed(d), color: dr.color });
      const sel = drawings.find((q) => q.id === p.selectedDrawingId);
      if (sel && isProjection(sel)) {
        const lv = projectionLevels(sel);
        axisLabels.push({ price: lv.tp, text: lv.tp.toFixed(d), color: TV.up }, { price: lv.entry, text: lv.entry.toFixed(d), color: TV.neutral }, { price: lv.sl, text: lv.sl.toFixed(d), color: TV.down });
        timeSpan = { from: { t: lv.fromT, text: stamp(lv.fromT) }, to: { t: lv.toT, text: stamp(lv.toT) } };
      } else if (sel) {
        if (sel.kind !== "hline" && sel.kind !== "vline" && sel.kind !== "daterange") for (const q of sel.points) axisLabels.push({ price: q.p, text: q.p.toFixed(d), color: sel.color });
        if (sel.kind !== "hline" && sel.kind !== "ray") {
          const [a, b] = sel.points;
          timeSpan = { from: { t: a.t, text: stamp(a.t) }, to: b && sel.kind !== "vline" && sel.kind !== "text" ? { t: b.t, text: stamp(b.t) } : null };
        }
      }
    }

    const bars = barsRef.current;
    // Trading-session background (intraday charts only).
    const sessionBands: { x0: number; x1: number; color: string }[] = [];
    if (p.sessionShading && TF_SECONDS[tfRef.current] <= 3600 && bars.length) {
      const range = chart.timeScale().getVisibleLogicalRange();
      const spacing = chart.timeScale().options().barSpacing;
      const colors: Record<string, string> = { Asia: "rgba(120,123,134,0.06)", London: "rgba(41,98,255,0.06)", "London/NY overlap": "rgba(124,77,255,0.08)", "New York": "rgba(255,152,0,0.06)" };
      if (range) {
        const a = Math.max(0, Math.floor(range.from));
        const b = Math.min(bars.length - 1, Math.ceil(range.to));
        for (let i = a; i <= b; i++) {
          const x = chart.timeScale().logicalToCoordinate(i as Logical);
          if (x === null) continue;
          const color = colors[marketSessionOf(bars[i].time)];
          const last = sessionBands[sessionBands.length - 1];
          if (last && last.color === color && Math.abs(last.x1 - (x - spacing / 2)) < 1) last.x1 = x + spacing / 2;
          else sessionBands.push({ x0: x - spacing / 2, x1: x + spacing / 2, color });
        }
      }
    }
    overlay.update({
      boxes,
      pills,
      drawings,
      draft: draftRef.current,
      selectedId: p.selectedDrawingId,
      hideDrawings: p.hideDrawings,
      sessionBands,
      barsBetween: (t1, t2) => {
        const a = timeToLogical(Math.min(t1, t2));
        const b = timeToLogical(Math.max(t1, t2));
        return a === null || b === null ? 0 : Math.round(b - a);
      },
      pipSize: spec.pipSize,
      digits: d,
      edgeT: bars.length ? bars[bars.length - 1].time : null,
      axisLabels,
      timeSpan,
      colors: colorsRef.current,
      timeToX,
      barSpacing: () => chartRef.current?.timeScale().options().barSpacing ?? 6,
    });
  }, [timeToX, timeToLogical]);

  /** Indicator values in the legend: at the hovered candle, else the latest one. */
  const legendBoxRef = useRef<HTMLDivElement>(null);
  const writeIndicatorValues = useCallback((at: ((ser: ISeriesApi<"Line" | "Histogram">) => number | undefined) | null) => {
    const root = legendBoxRef.current;
    if (!root) return;
    const n = barsRef.current.length;
    for (const { cfg, series } of indicatorsRef.current) {
      const el = root.querySelector<HTMLElement>(`[data-ind="${cfg.id}"]`);
      if (!el) continue;
      const order = cfg.type === "bb" ? [1, 0, 2] : cfg.type === "macd" ? [1, 2, 0] : [0];
      const dp = cfg.type === "rsi" ? 2 : cfg.type === "macd" ? digits + 1 : digits;
      el.textContent = order
        .map((k) => {
          const ser = series[k];
          if (!ser) return null;
          const v = at ? at(ser) : n ? (ser.dataByIndex(n - 1) as { value?: number } | null)?.value : undefined;
          return v !== undefined && Number.isFinite(v) ? v.toFixed(dp) : null;
        })
        .filter(Boolean)
        .join("  ");
    }
  }, [digits]);

  // -------------------------------------------------------------------------
  // Chart lifecycle
  // -------------------------------------------------------------------------

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const colors = readColors();
    colorsRef.current = colors;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.muted,
        fontFamily: colors.font || "ui-sans-serif, system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: true,
        panes: { separatorColor: colors.border, separatorHoverColor: colors.axis },
      },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.border },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const t = time as number;
          const tz = tzRef.current;
          if (type === TickMarkType.Year) return formatInTz(t, tz, "month").slice(-4);
          if (type === TickMarkType.Month) return formatInTz(t, tz, "month").slice(0, 3);
          if (type === TickMarkType.DayOfMonth) return formatInTz(t, tz, "tick-day");
          return formatInTz(t, tz, "time");
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.muted, style: LineStyle.Dashed, labelBackgroundColor: colors.accent },
        horzLine: { color: colors.muted, style: LineStyle.Dashed, labelBackgroundColor: colors.accent },
      },
      localization: {
        timeFormatter: (time: Time) => formatInTz(time as number, tzRef.current, "datetime"),
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: CANDLE.up,
      downColor: CANDLE.down,
      wickUpColor: CANDLE.up,
      wickDownColor: CANDLE.down,
      borderVisible: false,
      priceFormat: { type: "price", precision: digits, minMove: 1 / 10 ** digits },
    });
    const overlay = new ChartOverlay();
    series.attachPrimitive(overlay);
    chartRef.current = chart;
    seriesRef.current = series;
    overlayRef.current = overlay;
    markersRef.current = createSeriesMarkers(series, []);
    epochRef.current = -1;
    barsRef.current = [];
    const lines = linesRef.current;

    /** Magnet: snap to the nearest open/high/low/close of the candle at `t`. */
    const snap = (t: number, price: number) => {
      if (!propsRef.current.magnet) return price;
      const bars = barsRef.current;
      const i = barIndexAt(bars, t);
      if (i < 0) return price;
      const b = bars[i];
      return [b.open, b.high, b.low, b.close].reduce((best, v) => (Math.abs(v - price) < Math.abs(best - price) ? v : best), b.close);
    };

    const legendHtml = (bar: { open: number; high: number; low: number; close: number }, forming = false) => {
      const f = (x: number) => x.toFixed(digits);
      const up = bar.close >= bar.open;
      const chg = bar.open ? ((bar.close - bar.open) / bar.open) * 100 : 0;
      const cls = up ? "text-[#26c17a]" : "text-[#ef4f4f]";
      return `<span class="text-faint">O</span><span class="${cls}">${f(bar.open)}</span> <span class="text-faint">H</span><span class="${cls}">${f(bar.high)}</span> <span class="text-faint">L</span><span class="${cls}">${f(bar.low)}</span> <span class="text-faint">C</span><span class="${cls}">${f(bar.close)}</span> <span class="${cls}">${bar.close - bar.open >= 0 ? "+" : "−"}${Math.abs(bar.close - bar.open).toFixed(digits)} (${chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(2)}%)</span>${forming ? ' <span class="ml-1 rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning">FORMING</span>' : ""}`;
    };

    const onCrosshair = (param: MouseEventParams<Time>) => {
      const legend = legendRef.current;
      if (legend) {
        const d = param.time !== undefined ? (param.seriesData.get(series) as CandlestickData<Time> | undefined) : undefined;
        const last = barsRef.current[barsRef.current.length - 1];
        legend.dataset.hover = d ? "1" : "0";
        if (d) legend.innerHTML = legendHtml(d);
        else if (last) legend.innerHTML = legendHtml(last, last.forming);
      }
      writeIndicatorValues(param.time !== undefined ? (ser) => (param.seriesData.get(ser) as { value?: number } | undefined)?.value : null);
      const draft = draftRef.current;
      if (draft && param.point && param.logical !== undefined) {
        const t = logicalToTime(param.logical);
        const price = series.coordinateToPrice(param.point.y);
        if (t !== null && price !== null) {
          draftRef.current = { ...draft, points: [draft.points[0], { t, p: snap(t, roundPrice(price)) }] };
          renderOverlay();
        }
      }
    };

    // Clicks come from the DOM, not chart.subscribeClick: the library treats
    // any second click inside its double-click window as a double-click and
    // drops it, which broke two-click tools placed quickly.
    const onClick = (param: { point: { x: number; y: number }; logical?: number }) => {
      const p = propsRef.current;
      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;
      const rp = roundPrice(price);
      if (p.pick) {
        p.onPick(p.pick, rp);
        return;
      }
      const t = param.logical !== undefined ? logicalToTime(param.logical) : null;
      if (!isIdleTool(p.tool)) {
        if (t === null) return;
        const id = `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const drawings = p.snap.session.drawings;
        const sp = snap(t, rp);
        if (p.tool === "long" || p.tool === "short") {
          const proj = newProjection(p.tool, t, sp, p.snap.spec, barsRef.current, TF_SECONDS[tfRef.current]);
          p.onDrawingsChange([...drawings, proj]);
          p.onToolDone();
          p.onSelectDrawing(proj.id);
          p.onProjectionPlaced?.(proj.id);
          return;
        }
        if (ONE_POINT.includes(p.tool)) {
          const d: Drawing = { id, kind: p.tool as Drawing["kind"], points: [{ t, p: sp }], color: p.drawColor, width: 1, style: "solid", ...(p.tool === "text" ? { text: "Text", width: 2 as const } : {}) };
          p.onDrawingsChange([...drawings, d]);
          p.onToolDone();
          p.onSelectDrawing(id);
          return;
        }
        if (TWO_POINT.includes(p.tool as Drawing["kind"])) {
          const draft = draftRef.current;
          if (!draft) {
            draftRef.current = { id, kind: p.tool as Drawing["kind"], points: [{ t, p: sp }, { t, p: sp }], color: p.drawColor, width: 1, style: "solid" };
          } else {
            const done: Drawing = { ...draft, points: [draft.points[0], { t, p: sp }] };
            draftRef.current = null;
            p.onDrawingsChange([...drawings, done]);
            p.onToolDone();
            p.onSelectDrawing(done.id);
          }
          renderOverlay();
        }
        return;
      }
      // Cursor/crosshair: select the drawing under the pointer (projections by their box).
      const x = param.point.x;
      const y = param.point.y;
      p.onSelectDrawing(hitAt(x, y)?.id ?? null);
    };

    /** Drawing (incl. projections) under a pane point. */
    const hitAt = (x: number, y: number): { id: string; part: HitPart } | null => {
      const p = propsRef.current;
      if (p.hideDrawings) return null;
      const pr = projector();
      if (!pr) return null;
      const visible = p.hiddenDrawingId ? p.snap.session.drawings.filter((q) => q.id !== p.hiddenDrawingId) : p.snap.session.drawings;
      const generic = hitDrawing(visible, x, y, pr);
      if (generic) return generic;
      for (const d of [...visible].reverse()) {
        if (!isProjection(d)) continue;
        const lv = projectionLevels(d);
        const x1 = timeToX(lv.fromT);
        const x2 = timeToX(lv.toT);
        const ys = [lv.entry, lv.sl, lv.tp].map((q) => series.priceToCoordinate(q));
        if (x1 === null || x2 === null || ys.some((q) => q === null)) continue;
        const yy = ys as number[];
        if (x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(...yy) - 4 && y <= Math.max(...yy) + 4) return { id: d.id, part: "body" };
      }
      return null;
    };

    /** Trade-line row (right-aligned pills) near a pane point. */
    const pillRowAt = (x: number, y: number): string | null => {
      const rows = overlayRef.current?.state?.pills ?? [];
      const paneW = el.clientWidth - chart.priceScale("right").width();
      if (x < paneW - 560) return null;
      let best: { key: string; d: number } | null = null;
      for (const r of rows) {
        if (!r.key) continue;
        const ry = series.priceToCoordinate(r.price);
        if (ry === null) continue;
        const d = Math.abs(ry - y);
        if (d <= 11 && (!best || d < best.d)) best = { key: r.key, d };
      }
      return best?.key ?? null;
    };

    /** Position tool (long/short drawing) whose box contains a pane point. */
    const projectionAt = (x: number, y: number): string | null => {
      const p = propsRef.current;
      if (p.hideDrawings) return null;
      for (const d of [...p.snap.session.drawings].reverse()) {
        if (!isProjection(d) || d.id === p.hiddenDrawingId) continue;
        const lv = projectionLevels(d);
        const x1 = timeToX(lv.fromT);
        const x2 = timeToX(lv.toT);
        const ys = [lv.entry, lv.sl, lv.tp].map((q) => series.priceToCoordinate(q));
        if (x1 === null || x2 === null || ys.some((q) => q === null)) continue;
        const yy = ys as number[];
        if (x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(...yy) && y <= Math.max(...yy)) return d.id;
      }
      return null;
    };

    chart.subscribeCrosshairMove(onCrosshair);
    let downAt: { x: number; y: number } | null = null;
    /** Drawing-tool press point (for press-drag-release), the click it replaces, and the last pointer position. */
    let toolPress: { x: number; y: number } | null = null;
    let skipClick = false;
    let lastLocal: { x: number; y: number } | null = null;
    const onDomDown = (e: MouseEvent) => {
      downAt = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
      skipClick = false;
    };
    const onDomClick = (e: MouseEvent) => {
      if (skipClick) {
        skipClick = false; // already handled on press (drawing tools)
        return;
      }
      if (!downAt || Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y) > 5) return; // ended a pan/drag
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x > el.clientWidth - chart.priceScale("right").width()) return; // price axis
      const logical = chart.timeScale().coordinateToLogical(x);
      onClick({ point: { x, y }, logical: logical ?? undefined });
    };
    // Capture phase so it records presses the drag handler consumes too.
    el.addEventListener("mousedown", onDomDown, true);
    el.addEventListener("click", onDomClick);
    const onRange = () => {
      renderOverlay();
      const r = chart.timeScale().getVisibleLogicalRange();
      const n = barsRef.current.length;
      setEdgeVisible(!r || !n || (r.from <= n - 1 && r.to >= n - 1));
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    // Read-only view state for end-to-end checks (visible range, price range, auto-scale).
    (el as HTMLDivElement & { __replayView?: () => unknown }).__replayView = () => {
      const r = chart.timeScale().getVisibleLogicalRange();
      return {
        from: r?.from ?? null,
        to: r?.to ?? null,
        bars: barsRef.current.length,
        scrollPosition: chart.timeScale().scrollPosition(),
        top: series.coordinateToPrice(0),
        bottom: series.coordinateToPrice(Math.max(0, chart.panes()[0]?.getHeight() ?? el.clientHeight) - 1),
        autoScale: chart.priceScale("right").options().autoScale,
        markers: markersRef.current?.markers().length ?? 0,
      };
    };
    // Coordinate helpers for end-to-end checks of drawing placement.
    (el as HTMLDivElement & { __replayCoords?: unknown }).__replayCoords = {
      x: (t: number) => timeToX(t),
      y: (p: number) => series.priceToCoordinate(p),
      logical: (t: number) => timeToLogical(t),
      /** The candle time a time snaps to (equal to `t` when `t` is a candle). */
      snap: (t: number) => {
        const l = timeToLogical(t);
        return l === null ? null : logicalToTime(l);
      },
    };

    // ---------------------------------------------------------------------
    // Pointer handling in the capture phase so the chart doesn't pan while
    // pressing pill buttons or dragging SL/TP lines, ghosts and projections.
    // ---------------------------------------------------------------------
    const nearestLine = (y: number) => {
      let best: { key: string; target: DragTarget; price: number; d: number } | null = null;
      for (const [key, v] of lines) {
        const ly = series.priceToCoordinate(v.price);
        if (ly === null) continue;
        const d = Math.abs(ly - y);
        if (d <= 6 && (!best || d < best.d)) best = { key, target: v.target, price: v.price, d };
      }
      return best;
    };
    const local = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };
    const inPane = (x: number) => x <= el.clientWidth - chart.priceScale("right").width();
    const idle = () => isIdleTool(propsRef.current.tool) && !propsRef.current.pick;
    const marketAt = (x: number, y: number): { t: number; p: number } | null => {
      const price = series.coordinateToPrice(y);
      const logical = chart.timeScale().coordinateToLogical(x);
      const t = logical !== null ? logicalToTime(logical) : null;
      return price === null || t === null ? null : { t, p: price };
    };

    let autoScaleBeforeDrag = true;
    const beginDrag = (state: DragState) => {
      dragRef.current = state;
      chart.applyOptions({ handleScroll: false, handleScale: false });
      // Freeze the price scale so it doesn't rescale under the cursor.
      autoScaleBeforeDrag = chart.priceScale("right").options().autoScale;
      chart.priceScale("right").applyOptions({ autoScale: false });
    };

    /** Returns true when the press was consumed (button or drag start). */
    const press = (clientX: number, clientY: number): boolean => {
      const pp = propsRef.current;
      if (!pp.pick && !isIdleTool(pp.tool)) {
        // Drawing tools (TradingView): a press draws — it never pans the chart.
        // Two-point tools take click-click or press-drag-release.
        const { x, y } = local(clientX, clientY);
        if (!inPane(x)) return false;
        toolPress = { x, y };
        skipClick = true;
        const logical = chart.timeScale().coordinateToLogical(x);
        onClick({ point: { x, y }, logical: logical ?? undefined });
        return true;
      }
      if (!idle()) return false;
      const { x, y } = local(clientX, clientY);
      if (!inPane(x)) return false;
      const region = overlayRef.current?.hit(x, y) ?? null;
      if (region?.action) {
        propsRef.current.onAction(region.action);
        return true;
      }
      if (region?.drag) {
        const target = region.drag;
        if (target.kind === "projection") {
          const d = propsRef.current.snap.session.drawings.find((q) => q.id === target.id);
          if (!d) return false;
          propsRef.current.onSelectDrawing(d.id);
          if (d.locked || propsRef.current.lockAll) return true;
          const lv = projectionLevels(d);
          const start = target.field === "tp" ? lv.tp : target.field === "sl" ? lv.sl : lv.entry;
          beginDrag({ key: `proj:${d.id}`, target, price: start, orig: d, proj: d });
        } else {
          // Ghost "+SL / +TP": starts at the entry line of the position/order.
          const s = propsRef.current.snap;
          const owner = target.kind === "position" ? s.positions.find((q) => q.id === target.id) : s.orders.find((q) => q.id === (target as { id: string }).id);
          const entry = owner ? ("entryPrice" in owner ? owner.entryPrice : owner.price) : null;
          if (entry === null) return false;
          beginDrag({ key: `ghost:${target.kind}`, target, price: roundPrice(entry) });
        }
        renderOverlay();
        return true;
      }
      const line = nearestLine(y);
      if (line) {
        beginDrag({ key: line.key, target: line.target, price: line.price });
        return true;
      }
      // Drawings: select on press; drag/resize unless locked.
      const dh = hitAt(x, y);
      if (!dh) return false;
      const d = propsRef.current.snap.session.drawings.find((q) => q.id === dh.id);
      if (!d || isProjection(d)) return false;
      propsRef.current.onSelectDrawing(d.id);
      if (d.locked || propsRef.current.lockAll) return true;
      const at = marketAt(x, y);
      if (!at) return true;
      beginDrag({ key: `draw:${d.id}`, target: { kind: "drawing", id: d.id, field: dh.part }, price: at.p, orig: d, proj: d, part: dh.part, from: at });
      renderOverlay();
      return true;
    };

    const move = (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { x, y } = local(clientX, clientY);
      const price = series.coordinateToPrice(y);
      if (price === null) return;
      const rp = roundPrice(price);
      if (drag.target.kind === "drawing" && drag.orig && drag.part && drag.from) {
        const at = marketAt(x, y);
        if (at) {
          // Move by whole candles so the drawing keeps its shape across gaps (weekends).
          const lf = timeToLogical(drag.from.t);
          const lt = timeToLogical(at.t);
          const bars = lf !== null && lt !== null ? Math.round(lt - lf) : null;
          const shiftT =
            bars === null
              ? undefined
              : (t: number) => {
                  const lq = timeToLogical(t);
                  return lq === null ? t : (logicalToTime(lq + bars) ?? t);
                };
          drag.proj = dragDrawing(drag.orig, drag.part, drag.from, at, roundPrice, shiftT);
        }
      } else if (drag.target.kind === "projection" && drag.orig) {
        const lv = projectionLevels(drag.orig);
        const f = drag.target.field;
        if (f === "tp") drag.proj = withLevels(drag.orig, { tp: rp });
        else if (f === "sl") drag.proj = withLevels(drag.orig, { sl: rp });
        else if (f === "entry") {
          const dlt = rp - lv.entry;
          drag.proj = withLevels(drag.orig, { entry: rp, tp: roundPrice(lv.tp + dlt), sl: roundPrice(lv.sl + dlt) });
        } else {
          const logical = chart.timeScale().coordinateToLogical(x);
          const t = logical !== null ? logicalToTime(logical) : null;
          if (t !== null) drag.proj = withLevels(drag.orig, { toT: Math.max(lv.fromT + TF_SECONDS[tfRef.current], t) });
        }
        drag.price = rp;
      } else {
        drag.price = rp;
        lines.get(drag.key)?.line.applyOptions({ price: rp });
      }
      renderOverlay();
    };

    const release = () => {
      const tp = toolPress;
      toolPress = null;
      if (tp && draftRef.current && lastLocal && Math.hypot(lastLocal.x - tp.x, lastLocal.y - tp.y) > 6) {
        // Press-drag-release: the release point is the second anchor.
        const logical = chart.timeScale().coordinateToLogical(lastLocal.x);
        onClick({ point: lastLocal, logical: logical ?? undefined });
      }
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      chart.applyOptions({ handleScroll: true, handleScale: true });
      // Back to how the user had it (a manually zoomed price axis stays zoomed).
      chart.priceScale("right").applyOptions({ autoScale: autoScaleBeforeDrag });
      if (drag.target.kind === "projection" || drag.target.kind === "drawing") {
        if (drag.proj && drag.orig && drag.proj !== drag.orig) {
          const next = drag.proj;
          propsRef.current.onDrawingsChange(propsRef.current.snap.session.drawings.map((q) => (q.id === next.id ? next : q)));
        }
      } else if (!(drag.key.startsWith("ghost:") && drag.price === entryOf(drag))) {
        // A ghost released where it started (a click) sets nothing.
        propsRef.current.onDrag(drag.target, drag.price);
      }
      renderOverlay();
    };
    const entryOf = (drag: DragState): number => {
      const s = propsRef.current.snap;
      const id = "id" in drag.target ? drag.target.id : "";
      const pos = s.positions.find((q) => q.id === id);
      if (pos) return roundPrice(pos.entryPrice);
      const ord = s.orders.find((q) => q.id === id);
      return ord ? roundPrice(ord.price) : NaN;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (press(e.clientX, e.clientY)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      lastLocal = local(e.clientX, e.clientY);
      if (dragRef.current) {
        move(e.clientX, e.clientY);
        return;
      }
      if (e.target instanceof Node && el.contains(e.target)) {
        const p = propsRef.current;
        const { x, y } = local(e.clientX, e.clientY);
        let cursor = p.pick || !isIdleTool(p.tool) || p.tool === "crosshair" ? "crosshair" : "";
        const hovered = idle() && inPane(x) ? projectionAt(x, y) : null;
        const row = idle() && inPane(x) ? pillRowAt(x, y) : null;
        if (hovered !== hoverRef.current || row !== pillHoverRef.current) {
          hoverRef.current = hovered;
          pillHoverRef.current = row;
          renderOverlay();
        }
        if (idle() && inPane(x)) {
          const region = overlayRef.current?.hit(x, y);
          if (region) cursor = region.cursor;
          else if (nearestLine(y)) cursor = "ns-resize";
          else {
            const dh = hitAt(x, y);
            const d = dh && p.snap.session.drawings.find((q) => q.id === dh.id);
            if (d && !isProjection(d)) cursor = d.locked ? "pointer" : dh.part === "body" ? "move" : "grab";
          }
        }
        el.style.cursor = cursor;
      }
    };
    let lastAuto = chart.priceScale("right").options().autoScale;
    const syncAutoScale = () => {
      const a = chart.priceScale("right").options().autoScale;
      if (a !== lastAuto) {
        lastAuto = a;
        propsRef.current.onAutoScaleChange?.(a);
      }
    };
    const onMouseUp = () => {
      release();
      requestAnimationFrame(syncAutoScale);
    };
    const onLeave = () => {
      if (hoverRef.current || pillHoverRef.current) {
        hoverRef.current = null;
        pillHoverRef.current = null;
        renderOverlay();
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t && press(t.clientX, t.clientY)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) lastLocal = local(e.touches[0].clientX, e.touches[0].clientY);
      if (!dragRef.current) return;
      e.preventDefault();
      move(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onContext = (e: MouseEvent) => {
      const { x, y } = local(e.clientX, e.clientY);
      if (!inPane(x)) return;
      const price = series.coordinateToPrice(y);
      const logical = chart.timeScale().coordinateToLogical(x);
      const t = logical !== null ? logicalToTime(logical) : null;
      if (price === null || t === null) return;
      e.preventDefault();
      const dh = hitAt(x, y);
      propsRef.current.onContextMenu({ clientX: e.clientX, clientY: e.clientY, price: roundPrice(price), t, drawingId: dh?.id });
    };
    el.addEventListener("mousedown", onMouseDown, true);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("contextmenu", onContext);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onMouseUp);

    return () => {
      el.removeEventListener("mousedown", onMouseDown, true);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("contextmenu", onContext);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onMouseUp);
      chart.unsubscribeCrosshairMove(onCrosshair);
      el.removeEventListener("mousedown", onDomDown, true);
      el.removeEventListener("click", onDomClick);
      lines.clear();
      indicatorsRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      overlayRef.current = null;
      markersRef.current = null;
    };
    // The chart is created once per controller/instrument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, digits]);

  // With auto-scroll off the view never moves on its own.
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ shiftVisibleRangeOnNewBar: props.autoScroll });
  }, [props.autoScroll]);

  // Crosshair tool snaps to candle OHLC (magnet); others move freely.
  useEffect(() => {
    chartRef.current?.applyOptions({ crosshair: { mode: props.tool === "crosshair" || props.magnet ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal } });
  }, [props.tool, props.magnet]);

  useEffect(() => {
    renderOverlay();
  }, [props.hideDrawings, props.sessionShading, props.pastTrades, renderOverlay]);
  useEffect(() => {
    updateMarkers();
  }, [props.tradeLabels, props.pastTrades]);

  // Theme changes: re-read tokens and restyle without recreating the chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const colors = readColors();
    colorsRef.current = colors;
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: colors.background }, textColor: colors.muted, fontFamily: colors.font || undefined, panes: { separatorColor: colors.border } },
      crosshair: { vertLine: { color: colors.muted, labelBackgroundColor: colors.accent }, horzLine: { color: colors.muted, labelBackgroundColor: colors.accent } },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border },
    });
    renderOverlay();
  }, [resolvedTheme, renderOverlay]);

  // Indicator and marker refreshers read refs only, so they're safe to call from any effect.
  /** `from` = first candle index that may have changed (incremental mode). */
  function updateIndicators(full: boolean, from = 0) {
    const bars = barsRef.current;
    if (!bars.length) return;
    const closes = bars.map((b) => b.close);
    const push = (ser: ISeriesApi<"Line" | "Histogram">, values: ArrayLike<number>, colorOf?: (v: number) => string) => {
      if (full) {
        const data = [];
        for (let i = 0; i < bars.length; i++) {
          const v = values[i];
          data.push(Number.isFinite(v) ? { time: bars[i].time as UTCTimestamp, value: v, ...(colorOf ? { color: colorOf(v) } : {}) } : { time: bars[i].time as UTCTimestamp });
        }
        ser.setData(data);
      } else {
        for (let i = Math.min(from, bars.length - 1); i < bars.length; i++) {
          const v = values[i];
          ser.update(Number.isFinite(v) ? { time: bars[i].time as UTCTimestamp, value: v, ...(colorOf ? { color: colorOf(v) } : {}) } : { time: bars[i].time as UTCTimestamp });
        }
      }
    };
    for (const { cfg, series } of indicatorsRef.current) {
      if (cfg.type === "sma") push(series[0], sma(closes, cfg.period));
      else if (cfg.type === "ema") push(series[0], ema(closes, cfg.period));
      else if (cfg.type === "bb") {
        const b = bollinger(closes, cfg.period, cfg.param2 ?? 2);
        push(series[0], b.upper);
        push(series[1], b.mid);
        push(series[2], b.lower);
      } else if (cfg.type === "rsi") push(series[0], rsi(closes, cfg.period));
      else if (cfg.type === "atr") push(series[0], atr(bars.map((b) => b.high), bars.map((b) => b.low), closes, cfg.period));
      else if (cfg.type === "macd") {
        const m = macd(closes, cfg.period, cfg.param2 ?? 26, cfg.param3 ?? 9);
        push(series[0], m.hist, (v) => withAlpha(v >= 0 ? TV.up : TV.down, 0.5));
        push(series[1], m.line);
        push(series[2], m.signal);
      }
    }
  }

  function updateMarkers() {
    const plugin = markersRef.current;
    const bars = barsRef.current;
    if (!plugin || !bars.length) return;
    const s = propsRef.current.snap;
    const at = (t: number) => {
      const i = barIndexAt(bars, t);
      return i >= 0 ? (bars[i].time as UTCTimestamp) : null;
    };
    const markers: SeriesMarker<Time>[] = [];
    // TradingView-clean by default: a trade that hit its TP/SL (or was closed)
    // leaves nothing on the chart. "Past trades on chart" brings back its zones
    // and entry/exit markers; open positions are marked by their entry line.
    if (!propsRef.current.pastTrades) {
      plugin.setMarkers([]);
      return;
    }
    const labelsOn = propsRef.current.tradeLabels;
    const entry = (t: number, side: Side, label: string, id: string) => {
      const time = at(t);
      if (time === null) return;
      const text = labelsOn ? label : "";
      markers.push(
        side === "buy"
          ? { time, position: "belowBar", shape: "arrowUp", color: TV.up, text, id }
          : { time, position: "aboveBar", shape: "arrowDown", color: TV.down, text, id },
      );
    };
    for (const t of s.trades) {
      entry(t.entryT, t.side, `${t.side === "buy" ? "Buy" : "Sell"} ${t.lots}`, `${t.id}-in`);
      const time = at(t.exitT);
      if (time !== null) {
        const r = t.rMultiple !== null ? `${t.rMultiple >= 0 ? "+" : ""}${t.rMultiple.toFixed(1)}R` : `${t.netPnl >= 0 ? "+" : ""}${t.netPnl.toFixed(0)}`;
        markers.push({
          time,
          position: t.side === "buy" ? "aboveBar" : "belowBar",
          shape: "circle",
          color: t.netPnl >= 0 ? TV.up : TV.down,
          text: labelsOn ? `${t.exitReason.toUpperCase()} ${r}` : "",
          id: `${t.id}-out`,
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    plugin.setMarkers(markers);
  }

  // -------------------------------------------------------------------------
  // Candles — incremental when stepping forward, full redraw otherwise
  // -------------------------------------------------------------------------

  const tf = snap.session.timeframe;
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const prevTf = tfRef.current;
    tfRef.current = tf;
    const { bars, reset } = controller.chartBars();
    const prev = barsRef.current;
    const ts = chart.timeScale();
    // Where the user is looking, so updates never yank the view (TradingView-style).
    const range0 = ts.getVisibleLogicalRange();
    const atEdge = !range0 || !prev.length || range0.to >= prev.length - 1.5;
    /** Same zoom, same gap between the newest candle and the right edge. */
    const keepEdge = (n: number) => {
      if (!range0 || !prev.length) return;
      const gap = Math.max(-1, range0.to - (prev.length - 1));
      const to = n - 1 + gap;
      ts.setVisibleLogicalRange({ from: to - (range0.to - range0.from), to });
    };
    let full = reset || epochRef.current !== snap.chartEpoch || prev.length === 0 || bars.length < prev.length;
    // Only the previous last candle (possibly still forming) and new ones change.
    const changedFrom = Math.max(0, prev.length - 1);
    if (!full) {
      try {
        for (let k = changedFrom; k < bars.length; k++) series.update(toCandle(bars[k]));
        barsRef.current = bars;
        // Follow new candles only when the newest one was on screen; studying
        // history while stepping leaves the view where it is.
        if (propsRef.current.autoScroll && atEdge && bars.length > prev.length) keepEdge(bars.length);
      } catch {
        full = true; // out-of-order update — fall back to a full redraw
      }
    }
    if (full) {
      // Time at the centre of the view, from the bars being replaced.
      let centreT: number | null = null;
      if (range0 && prev.length && !atEdge) {
        const c = Math.round((range0.from + range0.to) / 2);
        const tfSec = TF_SECONDS[prevTf];
        centreT = c < 0 ? prev[0].time + c * tfSec : c >= prev.length ? prev[prev.length - 1].time + (c - prev.length + 1) * tfSec : prev[c].time;
      }
      series.setData(bars.map(toCandle));
      barsRef.current = bars;
      const n = bars.length;
      if (epochRef.current === -1 || prev.length === 0 || !range0) {
        ts.setVisibleLogicalRange({ from: Math.max(-5, n - 140), to: n + 16 });
      } else if (centreT === null) {
        // Was at the latest candle (step back, timeframe switch): same zoom, same gap to the right edge.
        keepEdge(n);
      } else {
        // Was studying history: keep the same moment in the middle at the same zoom.
        const c = timeToLogical(centreT);
        const half = (range0.to - range0.from) / 2;
        if (c !== null) ts.setVisibleLogicalRange({ from: c - half, to: c + half });
      }
      epochRef.current = snap.chartEpoch;
    }
    // Re-check "is the newest candle on screen?" after every update: when a redraw
    // lands on the same visible range the chart sends no range event.
    requestAnimationFrame(() => {
      const r = chartRef.current?.timeScale().getVisibleLogicalRange();
      const n = barsRef.current.length;
      setEdgeVisible(!r || !n || (r.from <= n - 1 && r.to >= n - 1));
    });
    const legend = legendRef.current;
    if (legend && legend.dataset.hover !== "1" && bars.length) {
      const b = bars[bars.length - 1];
      const f = (x: number) => x.toFixed(digits);
      const up = b.close >= b.open;
      const cls = up ? "text-[#26c17a]" : "text-[#ef4f4f]";
      const chg = b.open ? ((b.close - b.open) / b.open) * 100 : 0;
      legend.innerHTML = `<span class="text-faint">O</span><span class="${cls}">${f(b.open)}</span> <span class="text-faint">H</span><span class="${cls}">${f(b.high)}</span> <span class="text-faint">L</span><span class="${cls}">${f(b.low)}</span> <span class="text-faint">C</span><span class="${cls}">${f(b.close)}</span> <span class="${cls}">${b.close - b.open >= 0 ? "+" : "−"}${Math.abs(b.close - b.open).toFixed(digits)} (${chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(2)}%)</span>${b.forming ? ' <span class="ml-1 rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning">FORMING</span>' : ""}`;
    }
    try {
      updateIndicators(full, changedFrom);
    } catch {
      updateIndicators(true);
    }
    if (legend?.dataset.hover !== "1") writeIndicatorValues(null);
    updateMarkers();
    renderOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.index, tf, snap.chartEpoch, controller, resolvedTheme]);

  // -------------------------------------------------------------------------
  // Indicators (computed from revealed candles only)
  // -------------------------------------------------------------------------

  const indicatorKey = JSON.stringify(snap.session.indicators.filter((i) => i.visible && !i.hidden));
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of indicatorsRef.current) for (const ser of s.series) chart.removeSeries(ser);
    indicatorsRef.current = [];
    for (let i = chart.panes().length - 1; i >= 1; i--) {
      try {
        chart.removePane(i);
      } catch {
        // pane already gone
      }
    }
    const visible = snap.session.indicators.filter((i) => i.visible && !i.hidden);
    let pane = 1;
    for (const cfg of visible) {
      const series: ISeriesApi<"Line" | "Histogram">[] = [];
      const line = (color: string, paneIndex: number, width: 1 | 2 = 1, style: LineStyle = LineStyle.Solid) =>
        chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, paneIndex);
      if (cfg.type === "sma" || cfg.type === "ema") series.push(line(cfg.color, 0, 2));
      else if (cfg.type === "bb") series.push(line(cfg.color, 0), line(cfg.color, 0, 1, LineStyle.Dotted), line(cfg.color, 0));
      else if (cfg.type === "rsi" || cfg.type === "atr") series.push(line(cfg.color, pane++, 2));
      else if (cfg.type === "macd") {
        const p = pane++;
        series.push(chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, p), line(cfg.color, p, 2), line(colorsRef.current.muted, p, 1));
      }
      indicatorsRef.current.push({ cfg, series });
    }
    chart.panes().forEach((p, i) => {
      if (i > 0) p.setHeight(90);
    });
    updateIndicators(true);
    requestAnimationFrame(() => writeIndicatorValues(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorKey]);

  // -------------------------------------------------------------------------
  // Price lines: axis labels + draggable lines (pills carry the text)
  // -------------------------------------------------------------------------

  const linesKey = JSON.stringify({
    p: snap.positions.map((p) => [p.id, p.entryPrice, p.sl, p.tp, p.lots, p.side]),
    o: snap.orders.map((o) => [o.id, o.price, o.sl, o.tp, o.lots]),
    v: props.preview ? [props.preview.entry, props.preview.sl, props.preview.tp, props.preview.side] : null,
  });
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const lines = linesRef.current;
    for (const { line } of lines.values()) series.removePriceLine(line);
    lines.clear();
    const add = (key: string, target: DragTarget | null, price: number, color: string, style: LineStyle, width: 1 | 2 = 1) => {
      const line = series.createPriceLine({ price, color, lineWidth: width, lineStyle: style, axisLabelVisible: true, title: "" });
      // Lines without a target (position entries) get NaN so hit-testing skips them.
      lines.set(key, target ? { line, target, price } : { line, target: { kind: "preview", field: "entry" }, price: NaN });
    };
    for (const p of snap.positions) {
      add(`pe:${p.id}`, null, p.entryPrice, p.side === "buy" ? TV.up : TV.down, LineStyle.Solid);
      if (p.sl !== null) add(`ps:${p.id}`, { kind: "position", id: p.id, field: "sl" }, p.sl, TV.stop, LineStyle.Dashed);
      if (p.tp !== null) add(`pt:${p.id}`, { kind: "position", id: p.id, field: "tp" }, p.tp, TV.up, LineStyle.Dashed);
    }
    for (const o of snap.orders) {
      add(`oe:${o.id}`, { kind: "order", id: o.id, field: "price" }, o.price, TV.order, LineStyle.Dashed);
      if (o.sl !== null) add(`os:${o.id}`, { kind: "order", id: o.id, field: "sl" }, o.sl, TV.stop, LineStyle.Dotted);
      if (o.tp !== null) add(`ot:${o.id}`, { kind: "order", id: o.id, field: "tp" }, o.tp, TV.up, LineStyle.Dotted);
    }
    const pv = props.preview;
    if (pv) {
      if (pv.entry !== null) add("ve", { kind: "preview", field: "entry" }, pv.entry, TV.neutral, LineStyle.LargeDashed);
      if (pv.sl !== null) add("vs", { kind: "preview", field: "sl" }, pv.sl, withAlpha(TV.stop, 0.85), LineStyle.LargeDashed);
      if (pv.tp !== null) add("vt", { kind: "preview", field: "tp" }, pv.tp, withAlpha(TV.up, 0.85), LineStyle.LargeDashed);
    }
    renderOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey]);

  // Anything else that changes the overlay's text (P&L, sizing, selection).
  useEffect(() => {
    if (isIdleTool(props.tool)) draftRef.current = null;
    renderOverlay();
  }, [snap, props.preview, props.selectedDrawingId, props.tool, renderOverlay]);

  useImperativeHandle(
    props.handleRef,
    () => ({
      screenshot: () => {
        const chart = chartRef.current;
        if (!chart) return null;
        try {
          return chart.takeScreenshot(true).toDataURL("image/png");
        } catch {
          return null;
        }
      },
      resetView: () => {
        const n = barsRef.current.length;
        chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(-5, n - 140), to: n + 16 });
        chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
      },
      bars: () => barsRef.current,
      setVisibleDays: (days: number) => {
        const chart = chartRef.current;
        const bars = barsRef.current;
        if (!chart || !bars.length) return;
        const n = bars.length;
        const from = barIndexAt(bars, bars[n - 1].time - days * 86_400);
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, from), to: n + 4 });
        chart.priceScale("right").applyOptions({ autoScale: true });
      },
      setScaleMode: (mode) => {
        chartRef.current?.priceScale("right").applyOptions({ mode: mode === "percent" ? PriceScaleMode.Percentage : mode === "log" ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
      },
      setAutoScale: (on) => {
        chartRef.current?.priceScale("right").applyOptions({ autoScale: on });
      },
      zoomIn: () => {
        const chart = chartRef.current;
        const r = chart?.timeScale().getVisibleLogicalRange();
        if (!chart || !r) return;
        const span = r.to - r.from;
        const c = (r.from + r.to) / 2;
        chart.timeScale().setVisibleLogicalRange({ from: c - span * 0.35, to: c + span * 0.35 });
      },
    }),
    [],
  );

  const hint = props.pick
    ? `Click the chart to set the ${props.pick === "sl" ? "stop-loss" : props.pick === "tp" ? "take-profit" : "entry price"} · Esc to cancel`
    : props.tool === "long" || props.tool === "short"
      ? `Click to place a ${props.tool} position · Esc to cancel`
      : props.tool === "trend" || props.tool === "rect" || props.tool === "fib" || props.tool === "pricerange" || props.tool === "daterange"
        ? "Click two points · Esc to cancel"
        : !isIdleTool(props.tool)
          ? "Click to place · Esc to cancel"
          : null;

  const onChart = snap.session.indicators.filter((i) => i.visible);
  const { quote, spec } = snap;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" data-testid="replay-chart" />

      <div ref={legendBoxRef} className="pointer-events-none absolute left-3 top-2 z-10 max-w-[calc(100%-6rem)] space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 text-[13px] tabular-nums">
          <span className="font-medium text-foreground/90">
            {spec.symbol} · {TF_SHORT[tf]} · {snap.dataset.provider ? "FXCM" : snap.dataset.priceBasis === "unknown" ? "Imported" : snap.dataset.priceBasis}
          </span>
          <span className="h-2 w-2 rounded-full bg-profit" title="Replay" />
          <span ref={legendRef} className="flex flex-wrap gap-x-1.5 text-[12.5px]" />
        </div>
        {snap.context && !showsContext(tf) && (
          <p className="text-[11px] text-muted" data-testid="context-note">
            History before {formatInTz(snap.context.toT, snap.session.displayTimezone, "date")} is on 1h and higher timeframes.
          </p>
        )}
        {onChart.length > 0 && (
          <ul className="space-y-0.5" data-testid="indicator-legend">
            {onChart.map((ind) => (
              <li key={ind.id} className="group pointer-events-auto flex w-fit items-center gap-1.5 rounded-md px-1 py-px text-[12px] tabular-nums hover:bg-card/80">
                <span className={cn("font-medium", ind.hidden ? "text-faint" : "text-foreground/85")}>{indicatorTitle(ind)}</span>
                {!ind.hidden && <span data-ind={ind.id} style={{ color: ind.color }} />}
                <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" className="rounded p-0.5 text-muted hover:text-foreground" onClick={() => props.onIndicatorsChange?.(snap.session.indicators.map((i) => (i.id === ind.id ? { ...i, hidden: !i.hidden } : i)))} aria-label={ind.hidden ? `Show ${indicatorTitle(ind)}` : `Hide ${indicatorTitle(ind)}`}>
                    {ind.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" className="rounded p-0.5 text-muted hover:text-foreground" onClick={() => props.onOpenIndicators?.()} aria-label={`Settings for ${indicatorTitle(ind)}`}>
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="rounded p-0.5 text-muted hover:text-loss" onClick={() => props.onIndicatorsChange?.(snap.session.indicators.filter((i) => i.id !== ind.id))} aria-label={`Remove ${indicatorTitle(ind)}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {props.onQuickTrade && !snap.atEnd && (
          <div className="pointer-events-auto flex w-fit items-stretch overflow-hidden rounded-lg border border-border bg-card/90 shadow-sm backdrop-blur" role="group" aria-label="Quick trade">
            <button type="button" onClick={() => props.onQuickTrade?.("sell")} className="flex flex-col items-start px-2.5 py-1 text-left text-loss transition-colors hover:bg-loss-soft" data-testid="quick-sell" title="Open a sell order">
              <span className="text-[13px] font-semibold tabular-nums leading-tight">{quote.bid.toFixed(spec.digits)}</span>
              <span className="text-[9.5px] font-semibold uppercase tracking-wider">Sell</span>
            </button>
            <span className="flex items-center border-x border-border px-1.5 text-[10.5px] tabular-nums text-muted" title="Spread in pips">
              {(quote.spread / spec.pipSize).toFixed(1)}
            </span>
            <button type="button" onClick={() => props.onQuickTrade?.("buy")} className="flex flex-col items-end px-2.5 py-1 text-right text-profit transition-colors hover:bg-profit-soft" data-testid="quick-buy" title="Open a buy order">
              <span className="text-[13px] font-semibold tabular-nums leading-tight">{quote.ask.toFixed(spec.digits)}</span>
              <span className="text-[9.5px] font-semibold uppercase tracking-wider">Buy</span>
            </button>
          </div>
        )}
      </div>

      <div className="absolute bottom-9 right-[76px] z-10" data-testid="chart-controls">
        {!edgeVisible && (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-md hover:border-accent hover:text-accent"
            onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
            title="Scroll to the replay point (latest revealed candle)"
            aria-label="Scroll to the replay point"
            data-testid="go-to-replay"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {hint && <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-accent/40 bg-card/95 px-3 py-1 text-[11.5px] font-medium text-foreground shadow-md">{hint}</div>}
    </div>
  );
}
