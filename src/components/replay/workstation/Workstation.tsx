"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Flag, GripHorizontal, Loader2, NotebookPen, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useConfirm } from "@/components/ConfirmContext";
import { useToast } from "@/components/ToastContext";
import { ReplayController, SPEEDS, type NewCommand, type RewindPlan } from "@/lib/replay/controller";
import { duplicateSession, pinDataset } from "@/lib/replay/session";
import { getDataset, getSession, saveSession, validateRange } from "@/lib/replay/storage/repo";
import { planRequest, sessionDataRequests, type PipelineResult } from "@/lib/replay/marketData";
import { providerDatasetId } from "@/lib/replay/providers";
import PreparationScreen, { type LoadProgress, type Phase } from "./PreparationScreen";
import { formatInTz, TF_SECONDS } from "@/lib/replay/time";
import { labelOf } from "@/lib/replay/engine";
import type { DatasetMeta, Drawing, JournalEntry, ReplaySession, Side } from "@/lib/replay/types";
import { notifyReplayChanged, useStrategies } from "@/lib/replay/useReplayData";
import { cn } from "@/lib/utils";
import ReplayChart, { isIdleTool, type ChartContextEvent, type ChartHandle, type DragTarget, type DrawTool, type OverlayAction, type PickTarget, type TicketPreview } from "../chart/ReplayChart";
import { newProjection, projectionLevels } from "../chart/projection";
import JournalEditor from "../JournalEditor";
import BottomPanel from "./BottomPanel";
import ChartBottomBar, { type ScaleMode } from "./ChartBottomBar";
import ChartContextMenu, { type ContextItem } from "./ChartContextMenu";
import ChartTopBar from "./ChartTopBar";
import WorkstationHeader from "./WorkstationHeader";
import DrawingSettingsBar from "./DrawingSettingsBar";
import DrawingTools from "./DrawingTools";
import FavoritesBar from "./FavoritesBar";
import IndicatorsDialog from "./IndicatorsDialog";
import OrderPanel from "./OrderPanel";
import PositionManager from "./PositionManager";
import TradeExplorer from "../analytics/TradeExplorer";
import { enrichTrades } from "@/lib/replay/analytics";
import SettingsModal from "./SettingsModal";
import StatsDrawer from "./StatsDrawer";
import { readLocal, readLocalJson, useTerminalTheme, writeLocal } from "./terminal";
import { applyPrice, deriveTicket, initialTicket, type TicketState } from "./ticket";
import { ALL_TOOLS, DEFAULT_FAVORITES, DRAW_COLORS, TOOL_KEYS } from "./toolIcons";

export default function Workstation({ sessionId }: { sessionId: string }) {
  // Terminal look first, so the chart reads the right colours and font when it's created.
  useTerminalTheme();
  const [controller, setController] = useState<ReplayController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<ReplaySession | null>(null);
  const [loading, setLoading] = useState<LoadProgress | null>(null);
  const ctrlRef = useRef<ReplayController | null>(null);
  const cancelledRef = useRef(false);

  const open = useCallback(async (s: ReplaySession, onLoad?: (l: LoadProgress) => void, dataset?: DatasetMeta | null) => {
    const ctrl = await ReplayController.load(
      s,
      (loaded, total, bars) => {
        const l = { loaded, total, bars };
        if (onLoad) onLoad(l);
        else if (!cancelledRef.current) setLoading(l);
      },
      undefined,
      dataset,
    );
    if (cancelledRef.current) {
      void ctrl.dispose();
      return;
    }
    ctrlRef.current = ctrl;
    setPreparing(null);
    setController(ctrl);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      try {
        const s = await getSession(sessionId);
        if (!s) throw new Error("Session not found — it may have been deleted.");
        let ds: DatasetMeta | undefined;
        if (s.source?.kind === "provider") {
          // Download or reuse the session's history first (never blocks on cached data).
          const { fine, context } = sessionDataRequests(s);
          const now = Date.now() / 1000;
          ds = await getDataset(s.datasetId);
          let needed = !ds || !ds.count || planRequest(fine, ds, now).pending.length > 0;
          if (!needed && context) needed = planRequest(context, await getDataset(providerDatasetId(context)), now).pending.length > 0;
          if (needed) {
            if (!cancelledRef.current) setPreparing(s);
            return;
          }
        }
        await open(s, undefined, ds);
      } catch (e) {
        if (!cancelledRef.current) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelledRef.current = true;
      const ctrl = ctrlRef.current;
      ctrlRef.current = null;
      if (ctrl) void ctrl.dispose().then(() => notifyReplayChanged());
    };
  }, [sessionId, open]);

  const onPrepared = useCallback(
    async (r: PipelineResult, report: { phase: (p: Phase) => void; load: (l: LoadProgress) => void }) => {
      const s = await getSession(sessionId);
      if (!s) throw new Error("Session not found.");
      const ds = await getDataset(r.datasetId);
      if (!ds || !ds.count) throw new Error("No candles are available for this period — try another date range.");
      const inRange = ds.months.some((m) => m.lastT >= s.historyStartT && m.firstT <= s.endT);
      if (!inRange) throw new Error("The provider has no candles inside this session's period.");
      // Real gap check of the stored candles for this session's period (the base data).
      report.phase("validate");
      const check = await validateRange(ds.id, sessionDataRequests(s).fine.fromT, s.endT, ds.timeframe);
      if (!check.bars) throw new Error("The provider has no candles inside this session's period.");
      const pinned = {
        ...pinDataset(s, ds),
        dataCheck: { checkedAt: Date.now(), bars: check.bars, gapCount: check.gapCount, largeGaps: check.largeGaps.slice(0, 10), weekendGaps: check.weekendGaps, missingWeeks: r.missing },
      };
      const { revision } = await saveSession(pinned);
      notifyReplayChanged();
      report.phase("load");
      await open({ ...pinned, revision }, report.load, ds);
      report.phase("init");
    },
    [sessionId, open],
  );

  if (preparing && !error) return <PreparationScreen session={preparing} onReady={onPrepared} />;

  if (error) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <AlertTriangle className="mx-auto h-8 w-8 text-warning" />
          <h1 className="mt-3 text-base font-semibold">Can’t open this session</h1>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <Link href="/replay" className="btn btn-primary mt-4">
            <ArrowLeft className="h-4 w-4" /> Back to Replay
          </Link>
        </div>
      </div>
    );
  }
  if (!controller) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />{" "}
          {loading ? `Loading candles from the database… ${loading.bars.toLocaleString()} (${loading.loaded}/${loading.total} months)` : "Loading the session…"}
        </div>
      </div>
    );
  }
  return <WorkstationInner controller={controller} />;
}


function WorkstationInner({ controller }: { controller: ReplayController }) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const toast = useToast();
  const confirm = useConfirm();
  const { strategies } = useStrategies();
  const chartHandle = useRef<ChartHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<TicketState>(initialTicket);
  const [submitting, setSubmitting] = useState(false);
  const [tool, setTool] = useState<DrawTool>("cursor");
  const [idleTool, setIdleTool] = useState<DrawTool>("cursor");
  const [stay, setStay] = useState(() => readLocal("replay-stay", 0) === 1);
  const [drawColor] = useState(DRAW_COLORS[0]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(() => readLocal("replay-order-open", 0) === 1);
  const [statsOpen, setStatsOpen] = useState(false);
  const [hideValues, setHideValues] = useState(() => readLocal("replay-hide-values", 0) === 1);
  const [favorites, setFavorites] = useState<DrawTool[]>(() => readLocalJson<DrawTool[]>("replay-fav-tools", DEFAULT_FAVORITES));
  const [favBar, setFavBar] = useState(() => readLocal("replay-fav-bar", 1) === 1);
  const [bottomCollapsed, setBottomCollapsed] = useState(() => readLocal("replay-bottom-collapsed", 0) === 1);
  const [bottomH, setBottomH] = useState(() => readLocal("replay-bottom-h", 230));
  const [scaleMode, setScaleMode] = useState<ScaleMode>("normal");
  const [autoScale, setAutoScale] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  // Drawing undo/redo history (drawings only — trading has its own rewind).
  const history = useRef<{ past: Drawing[][]; future: Drawing[][] }>({ past: [], future: [] });
  const [histCounts, setHistCounts] = useState({ past: 0, future: 0 });
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null);
  const [journalId, setJournalId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState(false);
  const [menu, setMenu] = useState<{ e: ChartContextEvent; items: (ContextItem | "divider")[] } | null>(null);
  /** A position drawing just placed: ask whether to trade it. */
  const [usePrompt, setUsePrompt] = useState<string | null>(null);
  /** Open position in the "Manage position" dialog. */
  const [managing, setManaging] = useState<string | null>(null);
  /** Closed trade shown on a chart, as it was taken. */
  const [viewTradeId, setViewTradeId] = useState<string | null>(null);
  /** Position drawing currently filling the order panel (hidden behind the order preview). */
  const [linkedDrawing, setLinkedDrawing] = useState<string | null>(null);
  /** The ticket as it was before a drawing filled it — restored afterwards. */
  const ticketBeforeDrawing = useRef<TicketState | null>(null);

  const prefs = snap.session.chartPrefs ?? {};
  const derived = useMemo(() => deriveTicket(ticket, snap), [ticket, snap]);
  const preview: TicketPreview | null = useMemo(() => {
    // The order preview is on the chart while the order panel is open.
    if (!ticketOpen || snap.atEnd) return null;
    if (!derived.pendingType && derived.sl === null && derived.tp === null) return null;
    const linked = linkedDrawing ? snap.session.drawings.find((d) => d.id === linkedDrawing) : undefined;
    const span = linked ? projectionLevels(linked) : null;
    return { side: ticket.side, entry: derived.pendingType ? derived.entry : null, sl: derived.sl, tp: derived.tp, lots: derived.sizing.lots, fromT: span?.fromT, toT: span?.toT };
  }, [ticketOpen, ticket.side, derived, snap.atEnd, linkedDrawing, snap.session.drawings]);

  /** A drawing's levels only apply to that one order; then the usual ticket comes back. */
  const unlinkDrawing = useCallback(() => {
    const prev = ticketBeforeDrawing.current;
    ticketBeforeDrawing.current = null;
    if (prev) setTicket({ ...prev, note: "" });
    setLinkedDrawing(null);
  }, []);
  const setOrderOpen = useCallback(
    (v: boolean) => {
      setTicketOpen(v);
      writeLocal("replay-order-open", v ? 1 : 0);
      if (!v) {
        unlinkDrawing();
        setPick(null);
      }
    },
    [unlinkDrawing],
  );

  // -------------------------------------------------------------------------
  // Drawings: every change is undoable
  // -------------------------------------------------------------------------

  const changeDrawings = useCallback(
    (next: Drawing[]) => {
      const h = history.current;
      h.past.push(controller.session.drawings);
      if (h.past.length > 100) h.past.shift();
      h.future = [];
      controller.setDrawings(next);
      setHistCounts({ past: h.past.length, future: 0 });
    },
    [controller],
  );
  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(controller.session.drawings);
    controller.setDrawings(prev);
    setHistCounts({ past: h.past.length, future: h.future.length });
  }, [controller]);
  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(controller.session.drawings);
    controller.setDrawings(next);
    setHistCounts({ past: h.past.length, future: h.future.length });
  }, [controller]);

  const selected = selectedDrawing ? snap.session.drawings.find((d) => d.id === selectedDrawing) ?? null : null;
  const lockAll = Boolean(prefs.lockDrawings);
  const deleteDrawing = useCallback(
    (id: string) => {
      const d = controller.session.drawings.find((q) => q.id === id);
      if (!d) return;
      if (d.locked || controller.session.chartPrefs?.lockDrawings) {
        toast.error(d.locked ? "This drawing is locked — unlock it first." : "Drawings are locked — unlock them in the left toolbar first.");
        return;
      }
      changeDrawings(controller.session.drawings.filter((q) => q.id !== id));
      setSelectedDrawing(null);
    },
    [controller, changeDrawings, toast],
  );
  const updateDrawing = (next: Drawing) => changeDrawings(controller.session.drawings.map((q) => (q.id === next.id ? next : q)));
  const duplicateDrawing = (d: Drawing) => {
    const shift = 20 * TF_SECONDS[snap.session.timeframe];
    const copy: Drawing = { ...d, id: `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, locked: false, points: d.points.map((q) => ({ t: q.t + shift, p: q.p })) };
    changeDrawings([...controller.session.drawings, copy]);
    setSelectedDrawing(copy.id);
  };
  const chooseTool = (t: DrawTool) => {
    setPick(null);
    setTool(t);
    if (isIdleTool(t)) setIdleTool(t);
  };
  const toggleFavorite = (t: DrawTool) => {
    setFavorites((cur) => {
      const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
      writeLocal("replay-fav-tools", JSON.stringify(next));
      return next;
    });
  };

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  const submit = useCallback(
    (cmd: NewCommand) => {
      const r = controller.submit(cmd);
      if (!r.ok) toast.error(r.error);
      return r;
    },
    [controller, toast],
  );

  const placeOrder = () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const lots = derived.sizing.lots;
      const tf = snap.session.timeframe;
      const r = derived.pendingType
        ? submit({ type: "pending", orderType: derived.pendingType, price: derived.entry as number, lots, sl: derived.sl, tp: derived.tp, note: ticket.note, timeframe: tf })
        : submit({ type: "market", side: ticket.side, lots, sl: derived.sl, tp: derived.tp, note: ticket.note, timeframe: tf });
      if (r.ok) {
        toast.success(derived.pendingType ? "Order placed" : `${ticket.side === "buy" ? "Bought" : "Sold"} ${lots.toFixed(2)} ${snap.spec.symbol}`);
        // A position drawing used for this order becomes the order.
        if (linkedDrawing) changeDrawings(controller.session.drawings.filter((d) => d.id !== linkedDrawing));
        else setTicket((t) => ({ ...t, note: "" }));
        setOrderOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** Fill the order panel from a Long/Short position drawing (entry, stop, target). */
  const orderFromDrawing = (id: string) => {
    const d = controller.session.drawings.find((q) => q.id === id);
    if (!d || (d.kind !== "long" && d.kind !== "short")) return;
    const lv = projectionLevels(d);
    const { quote, spec } = snap;
    const ref = lv.side === "buy" ? quote.ask : quote.bid;
    const atMarket = Math.abs(lv.entry - ref) <= 2 * spec.pipSize;
    const orderType: TicketState["orderType"] = atMarket ? "market" : lv.side === "buy" ? (lv.entry < quote.ask ? "limit" : "stop") : lv.entry > quote.bid ? "limit" : "stop";
    const f = (p: number) => p.toFixed(spec.digits);
    if (!ticketBeforeDrawing.current) ticketBeforeDrawing.current = ticket;
    setTicket((t) => ({ ...t, side: lv.side, orderType, entry: f(lv.entry), slMode: "price", sl: f(lv.sl), tpMode: "price", tp: f(lv.tp) }));
    setLinkedDrawing(id);
    setSelectedDrawing(null);
    setUsePrompt(null);
    setTicketOpen(true);
    writeLocal("replay-order-open", 1);
  };

  const quickTrade = (side: Side) => {
    const base = ticketBeforeDrawing.current ?? ticket;
    ticketBeforeDrawing.current = null;
    setLinkedDrawing(null);
    setTicket({ ...base, side, orderType: "market" });
    setOrderOpen(true);
  };

  const doRewind = useCallback(
    async (plan: RewindPlan | null) => {
      if (!plan) return;
      if (plan.droppedCommands.length || plan.affectedTrades.length) {
        const ok = await confirm({
          title: "Step back and undo?",
          message: `Going back to ${formatInTz(plan.targetT + controller.baseSec, snap.session.displayTimezone, "datetime")} undoes ${plan.droppedCommands.length} action(s) taken after that point${plan.affectedTrades.length ? ` and removes ${plan.affectedTrades.length} closed trade(s) from this session` : ""}. Journal notes for removed trades are deleted. Duplicate the session first if you want to keep them.`,
          confirmText: "Undo and step back",
          destructive: true,
        });
        if (!ok) return;
      }
      controller.rewind(plan);
    },
    [confirm, controller, snap.session.displayTimezone],
  );

  const stepBack = useCallback(() => doRewind(controller.planStepBack()), [controller, doRewind]);

  const jump = (t: number) => {
    const idx = controller.indexForTime(t);
    if (idx >= snap.index) controller.jumpForwardTo(t);
    else void doRewind(controller.planRewind(idx));
  };

  const restart = async () => {
    const hasWork = snap.session.commands.length > 0;
    const ok = await confirm({
      title: "Restart session?",
      message: hasWork
        ? `The replay returns to the start and all ${snap.session.commands.length} recorded actions and ${snap.trades.length} trades in this session are cleared. A copy of the current results is saved as a new session first.`
        : "The replay returns to the session start.",
      confirmText: "Restart",
      destructive: true,
    });
    if (!ok) return;
    if (hasWork) {
      await controller.save();
      const copy = duplicateSession(controller.session, { keepProgress: true, name: `${controller.session.name} (before restart)` });
      await saveSession(copy);
      notifyReplayChanged();
      toast.success(`Saved a copy: “${copy.name}”`);
    }
    controller.reset();
  };

  const onDrag = (target: DragTarget, price: number) => {
    if (target.kind === "preview") setTicket((t) => applyPrice(t, target.field, price, derived, snap.spec.pipSize, snap.spec.digits));
    else if (target.kind === "position") submit({ type: "modify-position", positionId: target.id, [target.field]: price });
    else submit({ type: "modify-order", orderId: target.id, [target.field]: price });
  };

  // Buttons drawn on the chart: ✕ on trade pills.
  const onAction = (a: OverlayAction) => {
    switch (a.type) {
      case "close-position": {
        const r = submit({ type: "close", positionId: a.id });
        if (r.ok) toast.success("Position closed");
        break;
      }
      case "remove-level":
        if (a.owner === "position") submit({ type: "modify-position", positionId: a.id, [a.field]: null });
        else submit({ type: "modify-order", orderId: a.id, [a.field]: null });
        break;
      case "cancel-order":
        if (submit({ type: "cancel", orderId: a.id }).ok) toast.success("Order cancelled");
        break;
      case "place-projection":
        orderFromDrawing(a.id);
        break;
      case "delete-drawing":
        deleteDrawing(a.id);
        break;
      case "manage-position":
        setManaging(a.id);
        break;
    }
  };

  const addProjection = (kind: "long" | "short", t: number, price: number) => {
    const bars = chartHandle.current?.bars() ?? [];
    const proj = newProjection(kind, t, price, snap.spec, bars, TF_SECONDS[snap.session.timeframe]);
    changeDrawings([...controller.session.drawings, proj]);
    setSelectedDrawing(proj.id);
    setUsePrompt(proj.id);
  };

  /** Right-click menu: pending orders at the clicked price, sized and protected like the order panel. */
  const menuItems = (e: ChartContextEvent): (ContextItem | "divider")[] => {
    const d = snap.spec.digits;
    const items: (ContextItem | "divider")[] = [];
    for (const side of ["buy", "sell"] as const) {
      const ref = side === "buy" ? snap.quote.ask : snap.quote.bid;
      const orderType = side === "buy" ? (e.price < ref ? "limit" : "stop") : e.price > ref ? "limit" : "stop";
      const t = { ...ticket, side, orderType, entry: e.price.toFixed(d) } as TicketState;
      const dv = deriveTicket(t, snap);
      const ok = dv.errors.length === 0 && dv.sizing.lots > 0 && dv.pendingType !== null;
      items.push({
        label: `${labelOf(dv.pendingType ?? (`${side}-${orderType}` as never))} ${ok ? dv.sizing.lots.toFixed(2) : ""} @ ${e.price.toFixed(d)}`,
        hint: ok ? `SL ${dv.sl?.toFixed(d) ?? "—"} · TP ${dv.tp?.toFixed(d) ?? "—"} (from the order panel)` : dv.errors[0] ?? "Set a size in the order panel",
        icon: side,
        disabled: !ok,
        run: () => {
          const r = submit({ type: "pending", orderType: dv.pendingType!, price: dv.entry as number, lots: dv.sizing.lots, sl: dv.sl, tp: dv.tp, timeframe: snap.session.timeframe });
          if (r.ok) toast.success(`${labelOf(dv.pendingType!)} placed`);
        },
      });
    }
    items.push("divider");
    items.push({ label: "Long position tool here", icon: "long", run: () => addProjection("long", e.t, e.price) });
    items.push({ label: "Short position tool here", icon: "short", run: () => addProjection("short", e.t, e.price) });
    items.push({
      label: `Horizontal line @ ${e.price.toFixed(d)}`,
      icon: "line",
      run: () => changeDrawings([...controller.session.drawings, { id: `d_${Date.now().toString(36)}`, kind: "hline", points: [{ t: e.t, p: e.price }], color: drawColor }]),
    });
    if (e.drawingId) {
      const dr = controller.session.drawings.find((q) => q.id === e.drawingId);
      if (dr) {
        // Drawing actions first when the right-click hit a drawing.
        const own: (ContextItem | "divider")[] = [
          ...(dr.kind === "long" || dr.kind === "short" ? [{ label: "Use as order", icon: dr.kind, run: () => orderFromDrawing(dr.id) } as ContextItem] : []),
          { label: dr.locked ? "Unlock drawing" : "Lock drawing", icon: "line", run: () => updateDrawing({ ...dr, locked: !dr.locked }) },
          { label: "Duplicate drawing", icon: "line", run: () => duplicateDrawing(dr) },
          { label: "Delete drawing", icon: "line", danger: true, run: () => deleteDrawing(dr.id) },
          "divider",
        ];
        setSelectedDrawing(dr.id);
        return [...own, ...items];
      }
    }
    return items;
  };

  const onPick = (target: PickTarget, price: number) => {
    setTicket((t) => applyPrice(t, target, price, derived, snap.spec.pipSize, snap.spec.digits));
    setPick(null);
  };

  const screenshot = () => {
    const url = chartHandle.current?.screenshot();
    if (!url) {
      toast.error("Couldn't capture the chart.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `${snap.spec.symbol}_${snap.session.timeframe}_${formatInTz(snap.nowT, "UTC", "short").replace(/[^\w]+/g, "-")}.png`;
    a.click();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.().catch(() => toast.error("Full screen isn't available in this browser."));
  };
  useEffect(() => {
    const on = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const orderFromDrawingRef = useRef(orderFromDrawing);
  useEffect(() => {
    orderFromDrawingRef.current = orderFromDrawing;
  });

  // -------------------------------------------------------------------------
  // Keyboard shortcuts (ignored while typing)
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === " ") {
        e.preventDefault();
        controller.togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) controller.stepBase();
        else controller.stepForward();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        void stepBack();
      } else if (e.key === "Enter" && selectedDrawing) {
        // Enter on a selected Long/Short position fills the order panel from it.
        const d = controller.session.drawings.find((q) => q.id === selectedDrawing);
        if (d && (d.kind === "long" || d.kind === "short")) {
          e.preventDefault();
          orderFromDrawingRef.current(d.id);
        }
      } else if (e.key === "Escape") {
        setTool(idleTool);
        setPick(null);
        setSelectedDrawing(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedDrawing) {
        e.preventDefault();
        deleteDrawing(selectedDrawing);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const t = TOOL_KEYS[e.code.replace(/^Key/, "").toLowerCase()];
        if (t) {
          e.preventDefault();
          setPick(null);
          setTool(t);
          if (isIdleTool(t)) setIdleTool(t);
        }
      } else if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") {
        // Playback speed up / down through the speed steps.
        const i = SPEEDS.indexOf(controller.getSnapshot().speed as (typeof SPEEDS)[number]);
        const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 0 : i) + (e.key === "-" || e.key === "_" ? -1 : 1)))];
        controller.setSpeed(next);
        toast.success(`Speed ${next}×`);
      } else if (e.key === "?") {
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller, stepBack, selectedDrawing, idleTool, deleteDrawing, undo, redo, toast]);
  // Flush unsaved work when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void controller.save();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      const s = controller.getSnapshot().saveState;
      if (s === "dirty" || s === "saving") {
        void controller.save();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [controller]);

  // Bottom panel resize (drag the grip under the chart).
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomCollapsed ? 52 : bottomH;
    const clamp = (y: number) => Math.max(120, Math.min(window.innerHeight * 0.6, startH + (startY - y)));
    if (bottomCollapsed) {
      setBottomCollapsed(false);
      writeLocal("replay-bottom-collapsed", 0);
    }
    const move = (ev: PointerEvent) => setBottomH(clamp(ev.clientY));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      writeLocal("replay-bottom-h", clamp(ev.clientY));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const journalTrade = journalId ? snap.trades.find((t) => t.id === journalId) ?? snap.positions.find((p) => p.id === journalId) ?? null : null;
  const [journalDraft, setJournalDraft] = useState<JournalEntry>({});
  const openJournal = (id: string) => {
    setJournalDraft(controller.session.journal[id] ?? {});
    setJournalId(id);
  };

  const warnings = snap.warnings;
  const viewTrade = useMemo(() => {
    const t = viewTradeId ? snap.trades.find((q) => q.id === viewTradeId) : undefined;
    return t ? enrichTrades([t], snap.session.journal, snap.session.strategy, snap.session.name)[0] : null;
  }, [viewTradeId, snap.trades, snap.session.journal, snap.session.strategy, snap.session.name]);
  const activeIndicators = snap.session.indicators.filter((i) => i.visible).length;

  return (
    <div ref={rootRef} className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background text-foreground lg:overflow-hidden" data-testid="replay-workstation">
      <WorkstationHeader
        snap={snap}
        onTogglePlay={() => controller.togglePlay()}
        onStep={() => controller.stepForward()}
        onStepBase={() => controller.stepBase()}
        onBack={() => void stepBack()}
        onRestart={() => void restart()}
        onSpeed={(s) => controller.setSpeed(s)}
        onRename={(n) => controller.rename(n)}
        onStats={() => setStatsOpen((v) => !v)}
        statsOpen={statsOpen}
        onSettings={() => setSettingsOpen(true)}
        onHelp={() => setShortcutsOpen(true)}
        hideValues={hideValues}
        onHideValues={(v) => {
          setHideValues(v);
          writeLocal("replay-hide-values", v ? 1 : 0);
        }}
      />

      {(warnings.length > 0 && !dismissedWarnings) || snap.saveState === "error" ? (
        <div className="space-y-1.5 px-3 pb-2 sm:px-4">
          {warnings.length > 0 && !dismissedWarnings && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex-1 space-y-0.5">
                {warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
              <button type="button" onClick={() => setDismissedWarnings(true)} aria-label="Dismiss warnings">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {snap.saveState === "error" && (
            <div className="flex items-center gap-2 rounded-xl border border-loss/30 bg-loss-soft px-3 py-1.5 text-xs text-loss" role="alert">
              <AlertTriangle className="h-3.5 w-3.5" /> {snap.saveError}
            </div>
          )}
        </div>
      ) : null}

      {/* Phones: sections stack and the page scrolls. Desktop: a fixed terminal. */}
      <div className="relative flex shrink-0 flex-col gap-3 px-3 sm:px-4 lg:min-h-0 lg:flex-1 lg:shrink lg:flex-row">
        <section className="relative flex h-[68vh] min-h-[380px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card lg:h-auto lg:min-h-0 lg:flex-1" aria-label="Chart">
          <ChartTopBar
            snap={snap}
            center={favBar ? <FavoritesBar favorites={favorites} tool={tool} onTool={chooseTool} /> : null}
            onTimeframe={(tf) => controller.setTimeframe(tf)}
            onIndicators={() => setIndicatorsOpen(true)}
            activeIndicators={activeIndicators}
            onPlaceOrder={() => {
              unlinkDrawing();
              setOrderOpen(true);
            }}
            onJump={jump}
            canUndo={histCounts.past > 0}
            canRedo={histCounts.future > 0}
            onUndo={undo}
            onRedo={redo}
            onSave={() => void controller.save().then((ok) => (ok ? toast.success("Session saved") : toast.error(controller.getSnapshot().saveError ?? "Save failed")))}
            onTimezone={(tz) => controller.setDisplayTimezone(tz)}
            shading={Boolean(prefs.sessionShading)}
            onShading={(v) => controller.setChartPrefs({ sessionShading: v })}
            autoScroll={prefs.autoScroll !== false}
            onAutoScroll={(v) => controller.setChartPrefs({ autoScroll: v })}
            pastTrades={Boolean(prefs.pastTrades)}
            onPastTrades={(v) => controller.setChartPrefs({ pastTrades: v })}
            tradeLabels={Boolean(prefs.tradeLabels)}
            onTradeLabels={(v) => controller.setChartPrefs({ tradeLabels: v })}
            fullscreen={fullscreen}
            onFullscreen={toggleFullscreen}
            onScreenshot={screenshot}
          />
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="relative z-20 shrink-0 lg:border-r lg:border-border">
              <DrawingTools
                tool={tool}
                onTool={chooseTool}
                stay={stay}
                onStay={(v) => {
                  setStay(v);
                  writeLocal("replay-stay", v ? 1 : 0);
                }}
                magnet={Boolean(prefs.magnet)}
                onMagnet={(v) => controller.setChartPrefs({ magnet: v })}
                lockAll={lockAll}
                onLockAll={(v) => controller.setChartPrefs({ lockDrawings: v })}
                hidden={Boolean(prefs.hideDrawings)}
                onHidden={(v) => controller.setChartPrefs({ hideDrawings: v })}
                onZoomIn={() => chartHandle.current?.zoomIn()}
                onRemoveDrawings={async () => {
                  const ok = await confirm({ title: "Remove all drawings", message: `Remove all ${snap.session.drawings.length} drawings from this session? You can undo this.`, confirmText: "Remove", destructive: true });
                  if (ok) {
                    changeDrawings([]);
                    setSelectedDrawing(null);
                  }
                }}
                onRemoveIndicators={() => controller.setIndicators(snap.session.indicators.map((i) => ({ ...i, visible: false, hidden: false })))}
                indicatorCount={activeIndicators}
                favorites={favorites}
                onFavorite={toggleFavorite}
                favBar={favBar}
                onFavBar={(v) => {
                  setFavBar(v);
                  writeLocal("replay-fav-bar", v ? 1 : 0);
                }}
                drawings={snap.session.drawings}
                selectedId={selectedDrawing}
                onSelect={setSelectedDrawing}
                onToggleLock={(id) => {
                  const d = controller.session.drawings.find((q) => q.id === id);
                  if (d) updateDrawing({ ...d, locked: !d.locked });
                }}
                onDelete={deleteDrawing}
              />
            </div>
            <div className="relative min-h-0 min-w-0 flex-1">
              <ReplayChart
                controller={controller}
                snap={snap}
                tool={tool}
                drawColor={drawColor}
                onToolDone={() => !stay && setTool(idleTool)}
                pick={pick}
                onPick={onPick}
                preview={preview}
                onDrag={onDrag}
                selectedDrawingId={selectedDrawing}
                onSelectDrawing={(id) => {
                  setSelectedDrawing(id);
                  if (id !== usePrompt) setUsePrompt(null);
                }}
                onAction={onAction}
                onContextMenu={(e) => !snap.atEnd && setMenu({ e, items: menuItems(e) })}
                onDrawingsChange={changeDrawings}
                hideDrawings={Boolean(prefs.hideDrawings)}
                sessionShading={Boolean(prefs.sessionShading)}
                autoScroll={prefs.autoScroll !== false}
                onAutoScaleChange={setAutoScale}
                magnet={Boolean(prefs.magnet)}
                pastTrades={Boolean(prefs.pastTrades)}
                tradeLabels={Boolean(prefs.tradeLabels)}
                lockAll={lockAll}
                hiddenDrawingId={linkedDrawing}
                onProjectionPlaced={(id) => setUsePrompt(id)}
                onQuickTrade={quickTrade}
                onIndicatorsChange={(list) => controller.setIndicators(list)}
                onOpenIndicators={() => setIndicatorsOpen(true)}
                handleRef={chartHandle}
              />
              {selected && !prefs.hideDrawings && selected.id !== linkedDrawing && (
                <DrawingSettingsBar
                  key={selected.id}
                  drawing={selected}
                  onChange={updateDrawing}
                  onDuplicate={() => duplicateDrawing(selected)}
                  onDelete={() => deleteDrawing(selected.id)}
                  onPlaceOrder={snap.atEnd ? undefined : () => orderFromDrawing(selected.id)}
                />
              )}
              {usePrompt && usePrompt === selectedDrawing && !snap.atEnd && (
                <div
                  className="absolute bottom-12 left-1/2 z-20 w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 animate-pop-in rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur"
                  role="region"
                  aria-label="Use this drawing?"
                  data-testid="use-drawing-prompt"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">Use this drawing?</p>
                    <button type="button" onClick={() => setUsePrompt(null)} className="-m-1 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Dismiss">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">Turn it into an order (entry, stop and target), or keep it as an annotation.</p>
                  <div className="mt-2.5 flex justify-end gap-1.5">
                    <button type="button" className="rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/85 hover:bg-surface-2" onClick={() => setUsePrompt(null)} data-testid="use-drawing-annotation">
                      Leave as annotation
                    </button>
                    <button type="button" className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent-2" onClick={() => orderFromDrawing(usePrompt)} data-testid="use-drawing-order">
                      Use as order
                    </button>
                  </div>
                </div>
              )}
              {snap.atEnd && (
                <div className="absolute bottom-12 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs shadow-lg">
                  <Flag className="h-3.5 w-3.5 text-accent" /> End of session range.
                  <Link href={`/replay/analytics?session=${snap.session.id}`} className="font-semibold text-accent hover:underline">
                    View analytics
                  </Link>
                </div>
              )}
            </div>
          </div>
          <ChartBottomBar
            snap={snap}
            onRange={(days) => chartHandle.current?.setVisibleDays(days)}
            onJump={jump}
            onTimezone={(tz) => controller.setDisplayTimezone(tz)}
            scaleMode={scaleMode}
            onScaleMode={(m) => {
              setScaleMode(m);
              chartHandle.current?.setScaleMode(m);
            }}
            autoScale={autoScale}
            onAutoScale={(v) => {
              setAutoScale(v);
              chartHandle.current?.setAutoScale(v);
            }}
          />
          <div className="hidden h-3 shrink-0 cursor-row-resize items-center justify-center text-faint hover:text-foreground lg:flex" onPointerDown={startResize} role="separator" aria-orientation="horizontal" aria-label="Resize the trades panel" title="Drag to resize the trades panel">
            <GripHorizontal className="h-3.5 w-3.5" />
          </div>
        </section>

        {ticketOpen && (
          <aside className="flex min-h-[520px] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card lg:min-h-0 lg:w-[340px]" aria-label="Order panel">
            <OrderPanel
              snap={snap}
              ticket={ticket}
              derived={derived}
              onChange={setTicket}
              onSubmit={placeOrder}
              onClose={() => setOrderOpen(false)}
              submitting={submitting}
              pick={pick}
              onPick={(p) => {
                setTool("cursor");
                setPick(p);
              }}
              onRiskChange={(patch) => controller.updatePreferences(patch)}
              fromDrawing={linkedDrawing !== null}
            />
          </aside>
        )}

        {statsOpen && (
          <div className="fixed inset-x-3 bottom-3 top-16 z-40 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:right-4 sm:w-[380px] lg:absolute lg:bottom-0 lg:right-4 lg:top-0">
            <StatsDrawer snap={snap} onClose={() => setStatsOpen(false)} hideValues={hideValues} />
          </div>
        )}
      </div>

      <div className={cn("shrink-0 px-3 pb-3 pt-2 sm:px-4", bottomCollapsed ? "lg:h-[56px]" : "h-[340px] lg:h-[var(--bottom-h)]")} style={{ "--bottom-h": `${bottomH}px` } as React.CSSProperties}>
        <BottomPanel
          snap={snap}
          onSubmit={submit}
          onOpenJournal={openJournal}
          onNotes={(n) => controller.setNotes(n)}
          onManage={setManaging}
          onViewTrade={setViewTradeId}
          collapsed={bottomCollapsed}
          onToggleCollapsed={() => {
            setBottomCollapsed((v) => {
              writeLocal("replay-bottom-collapsed", v ? 0 : 1);
              return !v;
            });
          }}
        />
      </div>

      <IndicatorsDialog open={indicatorsOpen} onClose={() => setIndicatorsOpen(false)} indicators={snap.session.indicators} onChange={(list) => controller.setIndicators(list)} />

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts" size="md">
        <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2" data-testid="shortcuts">
          {(
            [
              ["Space", "Play / pause"],
              ["+ / −", "Playback speed up / down"],
              ["→", "Next candle"],
              ["Shift + →", "Next 1-minute step inside the candle"],
              ["←", "Previous candle (asks before undoing trades)"],
              ["Ctrl/⌘ + Z", "Undo drawing change"],
              ["Ctrl/⌘ + Shift + Z", "Redo drawing change"],
              ["Delete", "Delete selected drawing"],
              ["Enter", "Use the selected position drawing as an order"],
              ["Esc", "Cancel tool / deselect"],
              ["Right-click", "Orders at a price · drawing menu"],
              ...ALL_TOOLS.filter((t) => t.key).map((t) => [t.key!, t.label] as [string, string]),
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b border-border/60 py-1">
              <span className="text-muted">{v}</span>
              <kbd className="shrink-0 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold">{k}</kbd>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={journalId !== null}
        onClose={() => setJournalId(null)}
        title="Trade journal"
        subtitle={journalTrade ? `${journalTrade.side === "buy" ? "Long" : "Short"} ${snap.spec.symbol} · entered ${formatInTz(journalTrade.entryT, snap.session.displayTimezone, "datetime")}` : undefined}
        icon={NotebookPen}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary ml-auto" onClick={() => setJournalId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (journalId) controller.setJournal(journalId, journalDraft);
                setJournalId(null);
                toast.success("Journal saved");
              }}
              data-testid="journal-save"
            >
              Save journal
            </button>
          </>
        }
      >
        <JournalEditor value={journalDraft} onChange={setJournalDraft} strategies={strategies} defaultStrategy={snap.session.strategy} onCaptureScreenshot={() => chartHandle.current?.screenshot() ?? null} />
      </Modal>

      {managing && <PositionManager snap={snap} positionId={managing} onSubmit={submit} onClose={() => setManaging(null)} />}
      {viewTrade && <TradeExplorer trade={viewTrade} session={snap.session} journal={snap.session.journal[viewTrade.id]} onClose={() => setViewTradeId(null)} />}

      {menu && <ChartContextMenu x={menu.e.clientX} y={menu.e.clientY} title={`At ${menu.e.price.toFixed(snap.spec.digits)}`} items={menu.items} onClose={() => setMenu(null)} />}
      {settingsOpen && (
        <SettingsModal
          open
          onClose={() => setSettingsOpen(false)}
          snap={snap}
          strategies={strategies}
          onSave={async ({ name, strategy, displayTimezone, settings, executionChanged }) => {
            if (executionChanged && snap.session.commands.length) {
              const ok = await confirm({
                title: "Recompute this session?",
                message: "Changing costs, balance or conversion replays every recorded action with the new settings. Trade results in this session will change. Duplicate the session first to keep the current results.",
                confirmText: "Recompute",
                destructive: true,
              });
              if (!ok) return;
            }
            controller.rename(name.trim() || snap.session.name);
            controller.setStrategy(strategy);
            controller.setDisplayTimezone(displayTimezone);
            controller.updatePreferences({ pauseOnFill: settings.pauseOnFill });
            if (executionChanged) {
              const { rejected } = controller.updateExecutionSettings(settings);
              if (rejected) toast.error(`${rejected} action(s) were invalid under the new settings and were skipped.`);
            }
            setSettingsOpen(false);
            toast.success("Settings saved");
          }}
        />
      )}
    </div>
  );
}
