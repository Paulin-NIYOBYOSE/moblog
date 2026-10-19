"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ArrowRightToLine, Maximize2, MoveHorizontal } from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
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
import { levelLabel, levelStats, rewardRisk, signedMoney, signedPct } from "@/lib/replay/positionMath";
import { computeSizing } from "@/lib/replay/sizing";
import { formatInTz, marketSessionOf, TF_SECONDS } from "@/lib/replay/time";
import type { Drawing, IndicatorConfig, Side } from "@/lib/replay/types";
import { useTheme } from "@/components/ThemeContext";
import { ChartOverlay, TV, type Box, type DragTarget, type OverlayAction, type OverlayColors, type Pill, type PillRow } from "./overlay";
import { newProjection, projectionLevels, withLevels } from "./projection";
import { dragDrawing, hitDrawing, ONE_POINT, TWO_POINT, type HitPart, type Projector } from "./drawings";

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
  onAutoScroll: (v: boolean) => void;
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
    const base = b.close >= b.open ? TV.up : TV.down;
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
    const labels = (side: Side, entry: number, sl: number | null, tp: number | null, lots: number) => ({
      targetLabel: tp !== null ? levelLabel("Target", tp, stat(side, entry, tp, lots), d, ccy) : undefined,
      stopLabel: sl !== null ? levelLabel("Stop", sl, stat(side, entry, sl, lots), d, ccy) : undefined,
    });
    const rr = (entry: number, sl: number | null, tp: number | null) => {
      const v = rewardRisk(entry, sl, tp);
      return v === null ? "" : ` · R:R ${v.toFixed(2)}`;
    };
    const pct = (money: number) => (s.balance > 0 ? (money / s.balance) * 100 : null);

    const boxes: Box[] = [];
    const pills: PillRow[] = [];
    // Pills for a stop/target level, with ✕ to remove it.
    const levelPill = (owner: "position" | "order", id: string, side: Side, entry: number, field: "sl" | "tp", level: number, lots: number): PillRow => {
      const st = stat(side, entry, level, lots);
      return {
        price: level,
        pills: [
          {
            text: `${field === "sl" ? "SL" : "TP"}  ${st.money >= 0 ? "+" : "−"}${st.pips.toFixed(1)} pips  ${signedMoney(st.money, ccy)}  ${signedPct(st.accountPct)}`,
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

    for (const t of s.trades.slice(-60)) {
      boxes.push({ id: t.id, kind: "closed", side: t.side, fromT: t.entryT, toT: t.exitT, entry: t.entryPrice, sl: t.initialSl, tp: t.initialTp, exitPrice: t.exitPrice });
    }

    for (const pos of s.positions) {
      const sl = override({ kind: "position", id: pos.id, field: "sl" }, pos.sl);
      const tp = override({ kind: "position", id: pos.id, field: "tp" }, pos.tp);
      const pnl = s.positionPnl[pos.id]?.unrealized ?? 0;
      const exitPx = pos.side === "buy" ? s.quote.bid : s.quote.ask;
      const openPips = ((exitPx - pos.entryPrice) * (pos.side === "buy" ? 1 : -1)) / spec.pipSize;
      // Live trades: zones only — the pills on the right carry pips, money and %.
      boxes.push({ id: pos.id, kind: "open", side: pos.side, fromT: pos.entryT, toT: null, entry: pos.entryPrice, sl, tp });
      pills.push({
        price: pos.entryPrice,
        pills: [
          ...ghosts("position", pos.id, sl, tp),
          {
            text: `${pos.side === "buy" ? "LONG" : "SHORT"} ${pos.lots.toFixed(2)}  ${openPips >= 0 ? "+" : "−"}${Math.abs(openPips).toFixed(1)} pips  ${signedMoney(pnl, ccy)}  ${signedPct(pct(pnl))}${rr(pos.entryPrice, sl, tp)}`,
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
      pills.push({
        price,
        pills: [...ghosts("order", o.id, sl, tp), { text: `${labelOf(o.type).toUpperCase()} ${o.lots.toFixed(2)} @ ${price.toFixed(d)}${rr(price, sl, tp)}`, color: TV.order, close: { type: "cancel-order", id: o.id } }],
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
        fromT: s.cursorT,
        toT: null,
        entry,
        sl,
        tp,
        ...labels(pv.side, entry, sl, tp, pv.lots),
        centerLabel: `${pv.side === "buy" ? "Long" : "Short"} (ticket) · Qty: ${pv.lots > 0 ? pv.lots.toFixed(2) : "—"}${rr(entry, sl, tp)}`,
        centerColor: TV.neutral,
      });
    }

    const drawings: Drawing[] = [];
    for (const raw of s.session.drawings) {
      const dr = drag?.proj && drag.proj.id === raw.id ? drag.proj : raw;
      if (p.hideDrawings && isProjection(dr)) continue;
      drawings.push(dr);
      if (!isProjection(dr)) continue;
      const lv = projectionLevels(dr);
      const lots = computeSizing({
        mode: set.riskMode,
        side: lv.side,
        equity: s.equity,
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
      boxes.push({
        id: dr.id,
        kind: "projection",
        side: lv.side,
        fromT: lv.fromT,
        toT: lv.toT,
        entry: lv.entry,
        sl: lv.sl,
        tp: lv.tp,
        ...labels(lv.side, lv.entry, lv.sl, lv.tp, lots),
        centerLabel: `${lv.side === "buy" ? "Long" : "Short"} position · Qty: ${lots > 0 ? lots.toFixed(2) : "—"}${rr(lv.entry, lv.sl, lv.tp)}`,
        centerColor: TV.neutral,
        selected: dr.id === p.selectedDrawingId,
      });
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
      colors: colorsRef.current,
      timeToX,
      barSpacing: () => chartRef.current?.timeScale().options().barSpacing ?? 6,
    });
  }, [timeToX, timeToLogical]);

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
        fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
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
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        timeFormatter: (time: Time) => formatInTz(time as number, tzRef.current, "datetime"),
      },
    });
    // TradingView candle colours, as used by FX Replay.
    const series = chart.addSeries(CandlestickSeries, {
      upColor: TV.up,
      downColor: TV.down,
      wickUpColor: TV.up,
      wickDownColor: TV.down,
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

    const legendHtml = (bar: { open: number; high: number; low: number; close: number }, forming = false) => {
      const f = (x: number) => x.toFixed(digits);
      const up = bar.close >= bar.open;
      const chg = bar.open ? ((bar.close - bar.open) / bar.open) * 100 : 0;
      const cls = up ? "text-[#089981]" : "text-[#f23645]";
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
      const draft = draftRef.current;
      if (draft && param.point && param.logical !== undefined) {
        const t = logicalToTime(param.logical);
        const price = series.coordinateToPrice(param.point.y);
        if (t !== null && price !== null) {
          draftRef.current = { ...draft, points: [draft.points[0], { t, p: roundPrice(price) }] };
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
        if (p.tool === "long" || p.tool === "short") {
          const proj = newProjection(p.tool, t, rp, p.snap.spec, barsRef.current, TF_SECONDS[tfRef.current]);
          p.onDrawingsChange([...drawings, proj]);
          p.onToolDone();
          p.onSelectDrawing(proj.id);
          return;
        }
        if (ONE_POINT.includes(p.tool)) {
          const d: Drawing = { id, kind: p.tool as Drawing["kind"], points: [{ t, p: rp }], color: p.drawColor, width: 1, style: "solid", ...(p.tool === "text" ? { text: "Text", width: 2 as const } : {}) };
          p.onDrawingsChange([...drawings, d]);
          p.onToolDone();
          p.onSelectDrawing(id);
          return;
        }
        if (TWO_POINT.includes(p.tool as Drawing["kind"])) {
          const draft = draftRef.current;
          if (!draft) {
            draftRef.current = { id, kind: p.tool as Drawing["kind"], points: [{ t, p: rp }, { t, p: rp }], color: p.drawColor, width: 1, style: "solid" };
          } else {
            const done: Drawing = { ...draft, points: [draft.points[0], { t, p: rp }] };
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
      const generic = hitDrawing(p.snap.session.drawings, x, y, pr);
      if (generic) return generic;
      for (const d of [...p.snap.session.drawings].reverse()) {
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

    chart.subscribeCrosshairMove(onCrosshair);
    let downAt: { x: number; y: number } | null = null;
    const onDomDown = (e: MouseEvent) => {
      downAt = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    };
    const onDomClick = (e: MouseEvent) => {
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

    const beginDrag = (state: DragState) => {
      dragRef.current = state;
      chart.applyOptions({ handleScroll: false, handleScale: false });
      // Freeze the price scale so it doesn't rescale under the cursor.
      chart.priceScale("right").applyOptions({ autoScale: false });
    };

    /** Returns true when the press was consumed (button or drag start). */
    const press = (clientX: number, clientY: number): boolean => {
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
      if (d.locked) return true;
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
        if (at) drag.proj = dragDrawing(drag.orig, drag.part, drag.from, at, roundPrice);
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
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      chart.applyOptions({ handleScroll: true, handleScale: true });
      chart.priceScale("right").applyOptions({ autoScale: true });
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
      if (dragRef.current) {
        move(e.clientX, e.clientY);
        return;
      }
      if (e.target instanceof Node && el.contains(e.target)) {
        const p = propsRef.current;
        const { x, y } = local(e.clientX, e.clientY);
        let cursor = p.pick || !isIdleTool(p.tool) || p.tool === "crosshair" ? "crosshair" : "";
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
    const onMouseUp = () => release();
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t && press(t.clientX, t.clientY)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
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
    el.addEventListener("contextmenu", onContext);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onMouseUp);

    return () => {
      el.removeEventListener("mousedown", onMouseDown, true);
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

  // Crosshair tool snaps to candle OHLC (magnet); others move freely.
  useEffect(() => {
    chartRef.current?.applyOptions({ crosshair: { mode: props.tool === "crosshair" ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal } });
  }, [props.tool]);

  useEffect(() => {
    renderOverlay();
  }, [props.hideDrawings, props.sessionShading, renderOverlay]);

  // Theme changes: re-read tokens and restyle without recreating the chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const colors = readColors();
    colorsRef.current = colors;
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: colors.background }, textColor: colors.muted, panes: { separatorColor: colors.border } },
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
    const entry = (t: number, side: Side, text: string, id: string) => {
      const time = at(t);
      if (time === null) return;
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
          text: `${t.exitReason.toUpperCase()} ${r}`,
          id: `${t.id}-out`,
        });
      }
    }
    for (const p of s.positions) entry(p.entryT, p.side, `${p.side === "buy" ? "Buy" : "Sell"} ${p.initialLots}`, `${p.id}-in`);
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
    tfRef.current = tf;
    const { bars, reset } = controller.chartBars();
    const prev = barsRef.current;
    let full = reset || epochRef.current !== snap.chartEpoch || prev.length === 0 || bars.length < prev.length;
    // Only the previous last candle (possibly still forming) and new ones change.
    const changedFrom = Math.max(0, prev.length - 1);
    if (!full) {
      try {
        for (let k = changedFrom; k < bars.length; k++) series.update(toCandle(bars[k]));
        if (propsRef.current.autoScroll && bars.length > prev.length) {
          const r = chart.timeScale().getVisibleLogicalRange();
          if (r && r.to < bars.length - 1) chart.timeScale().scrollToRealTime();
        }
        barsRef.current = bars;
      } catch {
        full = true; // out-of-order update — fall back to a full redraw
      }
    }
    if (full) {
      series.setData(bars.map(toCandle));
      barsRef.current = bars;
      if (epochRef.current === -1 || prev.length === 0 || reset) {
        const n = bars.length;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(-5, n - 140), to: n + 16 });
      }
      epochRef.current = snap.chartEpoch;
    }
    const legend = legendRef.current;
    if (legend && legend.dataset.hover !== "1" && bars.length) {
      const b = bars[bars.length - 1];
      const f = (x: number) => x.toFixed(digits);
      const up = b.close >= b.open;
      const cls = up ? "text-[#089981]" : "text-[#f23645]";
      const chg = b.open ? ((b.close - b.open) / b.open) * 100 : 0;
      legend.innerHTML = `<span class="text-faint">O</span><span class="${cls}">${f(b.open)}</span> <span class="text-faint">H</span><span class="${cls}">${f(b.high)}</span> <span class="text-faint">L</span><span class="${cls}">${f(b.low)}</span> <span class="text-faint">C</span><span class="${cls}">${f(b.close)}</span> <span class="${cls}">${b.close - b.open >= 0 ? "+" : "−"}${Math.abs(b.close - b.open).toFixed(digits)} (${chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(2)}%)</span>${b.forming ? ' <span class="ml-1 rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning">FORMING</span>' : ""}`;
    }
    try {
      updateIndicators(full, changedFrom);
    } catch {
      updateIndicators(true);
    }
    updateMarkers();
    renderOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.index, tf, snap.chartEpoch, controller, resolvedTheme]);

  // -------------------------------------------------------------------------
  // Indicators (computed from revealed candles only)
  // -------------------------------------------------------------------------

  const indicatorKey = JSON.stringify(snap.session.indicators.filter((i) => i.visible));
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
    const visible = snap.session.indicators.filter((i) => i.visible);
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
    }),
    [],
  );

  const hint = props.pick
    ? `Click the chart to set the ${props.pick === "sl" ? "stop-loss" : props.pick === "tp" ? "take-profit" : "entry price"} · Esc to cancel`
    : props.tool === "long" || props.tool === "short"
      ? `Click to place a ${props.tool} position · drag its edges to set stop and target · Esc to cancel`
      : props.tool === "trend" || props.tool === "rect"
        ? "Click two points · Esc to cancel"
        : props.tool !== "cursor"
          ? "Click to place · Esc to cancel"
          : null;

  return (
    <div className="relative h-full w-full">
      <div className="absolute bottom-9 right-[72px] z-10 flex items-center gap-1" data-testid="chart-controls">
        {!edgeVisible && (
          <button
            type="button"
            className="flex h-7 items-center gap-1 rounded-md border border-border bg-card/95 px-2 text-[11px] font-medium shadow-sm hover:border-accent hover:text-accent"
            onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
            title="Scroll to the replay point (latest revealed candle)"
            data-testid="go-to-replay"
          >
            <ArrowRightToLine className="h-3.5 w-3.5" /> Replay point
          </button>
        )}
        <button
          type="button"
          aria-pressed={props.autoScroll}
          onClick={() => props.onAutoScroll(!props.autoScroll)}
          className={`flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/95 shadow-sm ${props.autoScroll ? "text-accent" : "text-muted"} hover:text-foreground`}
          title={props.autoScroll ? "Auto-scroll on — the newest candle stays in view" : "Auto-scroll off — the view stays where you put it"}
          aria-label="Auto-scroll"
        >
          <MoveHorizontal className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            const n = barsRef.current.length;
            chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(-5, n - 140), to: n + 12 });
            chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/95 text-muted shadow-sm hover:text-foreground"
          title="Reset chart view (zoom, scroll and price scale)"
          aria-label="Reset chart view"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div ref={containerRef} className="absolute inset-0" data-testid="replay-chart" />
      <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-wrap items-center gap-x-1.5 text-[11px] font-medium tabular-nums text-foreground">
        <span className="font-semibold">{snap.spec.symbol}</span>
        <span className="text-faint">·</span>
        <span className="text-muted">{tf}</span>
        <span className="text-faint">·</span>
        <span className="text-muted">{snap.dataset.priceBasis === "unknown" ? "price basis unknown" : snap.dataset.priceBasis}</span>
        <span ref={legendRef} className="ml-1.5 flex flex-wrap gap-x-1" />
      </div>
      {hint && <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full border border-accent/40 bg-card/95 px-3 py-1 text-[11px] font-medium text-foreground shadow-md">{hint}</div>}
    </div>
  );
}
