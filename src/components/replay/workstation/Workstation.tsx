"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Flag, Loader2, NotebookPen, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useConfirm } from "@/components/ConfirmContext";
import { useToast } from "@/components/ToastContext";
import { ReplayController, type NewCommand, type RewindPlan } from "@/lib/replay/controller";
import { duplicateSession, pinDataset } from "@/lib/replay/session";
import { getDataset, getSession, saveSession, validateRange } from "@/lib/replay/storage/repo";
import { planRequest, type PipelineResult } from "@/lib/replay/marketData";
import PreparationScreen, { type LoadProgress, type Phase } from "./PreparationScreen";
import { formatInTz, TF_SECONDS } from "@/lib/replay/time";
import { labelOf } from "@/lib/replay/engine";
import type { JournalEntry, ReplaySession } from "@/lib/replay/types";
import { notifyReplayChanged, useStrategies } from "@/lib/replay/useReplayData";
import { cn } from "@/lib/utils";
import ReplayChart, { isIdleTool, type ChartContextEvent, type ChartHandle, type DragTarget, type DrawTool, type OverlayAction, type PickTarget, type TicketPreview } from "../chart/ReplayChart";
import DrawingSettingsBar from "./DrawingSettingsBar";
import { DRAWING_TOOLS, TOOL_KEYS } from "./DrawingTools";
import type { Drawing } from "@/lib/replay/types";
import { newProjection } from "../chart/projection";
import ChartContextMenu, { type ContextItem } from "./ChartContextMenu";
import ProjectionOrderModal from "./ProjectionOrderModal";
import JournalEditor from "../JournalEditor";
import BottomPanel from "./BottomPanel";
import DrawingTools, { DRAW_COLORS } from "./DrawingTools";
import OrderTicket, { AccountStrip } from "./OrderTicket";
import SettingsModal from "./SettingsModal";
import Toolbar from "./Toolbar";
import { applyPrice, deriveTicket, initialTicket, type TicketState } from "./ticket";

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // storage blocked — layout just won't persist
  }
}

export default function Workstation({ sessionId }: { sessionId: string }) {
  const [controller, setController] = useState<ReplayController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<ReplaySession | null>(null);
  const [loading, setLoading] = useState<LoadProgress | null>(null);
  const ctrlRef = useRef<ReplayController | null>(null);
  const cancelledRef = useRef(false);

  const open = useCallback(async (s: ReplaySession, onLoad?: (l: LoadProgress) => void) => {
    const ctrl = await ReplayController.load(s, (loaded, total, bars) => {
      const l = { loaded, total, bars };
      if (onLoad) onLoad(l);
      else if (!cancelledRef.current) setLoading(l);
    });
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
        if (s.source?.kind === "provider") {
          // Download or reuse the session's history first (never blocks on cached data).
          const ds = await getDataset(s.datasetId);
          const plan = planRequest({ provider: "fxcm", symbol: s.symbol, resolution: s.source.resolution ?? "M1", fromT: s.historyStartT, toT: s.endT }, ds, Date.now() / 1000);
          if (plan.pending.length || !ds || !ds.count) {
            if (!cancelledRef.current) setPreparing(s);
            return;
          }
        }
        await open(s);
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
      // Real gap check of the stored candles for this session's period.
      report.phase("validate");
      const check = await validateRange(ds.id, s.historyStartT, s.endT, ds.timeframe);
      if (!check.bars) throw new Error("The provider has no candles inside this session's period.");
      const pinned = {
        ...pinDataset(s, ds),
        dataCheck: { checkedAt: Date.now(), bars: check.bars, gapCount: check.gapCount, largeGaps: check.largeGaps.slice(0, 10), weekendGaps: check.weekendGaps, missingWeeks: r.missing },
      };
      const { revision } = await saveSession(pinned);
      notifyReplayChanged();
      report.phase("load");
      await open({ ...pinned, revision }, report.load);
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

  const [ticket, setTicket] = useState<TicketState>(initialTicket);
  const [submitting, setSubmitting] = useState(false);
  const [tool, setTool] = useState<DrawTool>("cursor");
  const [idleTool, setIdleTool] = useState<DrawTool>("cursor");
  const [stay, setStay] = useState(() => (typeof window === "undefined" ? false : readNumber("replay-stay", 0) === 1));
  const [drawColor] = useState(DRAW_COLORS[0]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [rightW, setRightW] = useState(() => (typeof window === "undefined" ? 316 : readNumber("replay-right-w", 316)));
  const [bottomCollapsed, setBottomCollapsed] = useState(() => (typeof window === "undefined" ? false : readNumber("replay-bottom-collapsed", 0) === 1));
  // Drawing undo/redo history (drawings only — trading has its own rewind).
  const history = useRef<{ past: Drawing[][]; future: Drawing[][] }>({ past: [], future: [] });
  const [histCounts, setHistCounts] = useState({ past: 0, future: 0 });
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null);
  const [journalId, setJournalId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(true);
  const [bottomH, setBottomH] = useState(() => (typeof window === "undefined" ? 240 : readNumber("replay-bottom-h", 240)));
  const [dismissedWarnings, setDismissedWarnings] = useState(false);
  const [placing, setPlacing] = useState<string | null>(null);
  const [ticketActive, setTicketActive] = useState(false);
  const [menu, setMenu] = useState<{ e: ChartContextEvent; items: (ContextItem | "divider")[] } | null>(null);

  const derived = useMemo(() => deriveTicket(ticket, snap), [ticket, snap]);
  const preview: TicketPreview | null = useMemo(() => {
    // Market tickets preview only while you're using the order panel; pending
    // orders keep their preview so the entry line can be dragged on the chart.
    const show = ticket.orderType !== "market" || (ticketActive && (derived.sl !== null || derived.tp !== null)) || pick !== null;
    if (!show || snap.atEnd) return null;
    return { side: ticket.side, entry: derived.pendingType ? derived.entry : null, sl: derived.sl, tp: derived.tp, lots: derived.sizing.lots };
  }, [ticket.orderType, ticket.side, derived, snap.atEnd, ticketActive, pick]);

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
  const deleteDrawing = useCallback(
    (id: string) => {
      const d = controller.session.drawings.find((q) => q.id === id);
      if (!d) return;
      if (d.locked) {
        toast.error("This drawing is locked — unlock it first.");
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
  const prefs = snap.session.chartPrefs ?? {};

  // -------------------------------------------------------------------------
  // Actions
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
        setTicket((t) => ({ ...t, note: "" }));
      }
    } finally {
      setSubmitting(false);
    }
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

  // Buttons drawn on the chart: ✕ on trade pills, Place order on projections.
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
        setPlacing(a.id);
        break;
      case "delete-drawing":
        deleteDrawing(a.id);
        break;
    }
  };

  const addProjection = (kind: "long" | "short", t: number, price: number) => {
    const bars = chartHandle.current?.bars() ?? [];
    const proj = newProjection(kind, t, price, snap.spec, bars, TF_SECONDS[snap.session.timeframe]);
    changeDrawings([...controller.session.drawings, proj]);
    setSelectedDrawing(proj.id);
  };

  /** Right-click menu: pending orders at the clicked price, sized and protected like the ticket. */
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
      const d = controller.session.drawings.find((q) => q.id === e.drawingId);
      if (d) {
        // Drawing actions first when the right-click hit a drawing.
        const own: (ContextItem | "divider")[] = [
          { label: d.locked ? "Unlock drawing" : "Lock drawing", icon: "line", run: () => updateDrawing({ ...d, locked: !d.locked }) },
          { label: "Duplicate drawing", icon: "line", run: () => duplicateDrawing(d) },
          { label: "Delete drawing", icon: "line", danger: true, run: () => deleteDrawing(d.id) },
          "divider",
        ];
        setSelectedDrawing(d.id);
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
        // Enter on a selected Long/Short position tool opens "Place order".
        const d = controller.session.drawings.find((q) => q.id === selectedDrawing);
        if (d && (d.kind === "long" || d.kind === "short")) {
          e.preventDefault();
          setPlacing(d.id);
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
      } else if (e.key === "?") {
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller, stepBack, selectedDrawing, idleTool, deleteDrawing, undo, redo]);

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

  // Bottom panel resize.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomH;
    const move = (ev: PointerEvent) => {
      const h = Math.max(120, Math.min(window.innerHeight * 0.65, startH + (startY - ev.clientY)));
      setBottomH(h);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      writeNumber("replay-bottom-h", Math.max(120, Math.min(window.innerHeight * 0.65, startH + (startY - ev.clientY))));
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

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background lg:overflow-hidden" data-testid="replay-workstation">
      <Toolbar
        snap={snap}
        onTogglePlay={() => controller.togglePlay()}
        onStep={() => controller.stepForward()}
        onStepBase={() => controller.stepBase()}
        onBack={() => void stepBack()}
        onRestart={() => void restart()}
        onSpeed={(s) => controller.setSpeed(s)}
        onTimeframe={(tf) => controller.setTimeframe(tf)}
        onJump={jump}
        onRename={(n) => controller.rename(n)}
        onIndicators={(list) => controller.setIndicators(list)}
        onTimezone={(tz) => controller.setDisplayTimezone(tz)}
        onScreenshot={screenshot}
        onSettings={() => setSettingsOpen(true)}
        ticketOpen={ticketOpen}
        onToggleTicket={() => setTicketOpen((v) => !v)}
        onSave={() => void controller.save().then((ok) => (ok ? toast.success("Session saved") : toast.error(controller.getSnapshot().saveError ?? "Save failed")))}
      />

      {warnings.length > 0 && !dismissedWarnings && (
        <div className="flex shrink-0 items-start gap-2 border-b border-warning/30 bg-warning-soft px-3 py-1.5 text-xs text-warning">
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
        <div className="flex shrink-0 items-center gap-2 border-b border-loss/30 bg-loss-soft px-3 py-1.5 text-xs text-loss" role="alert">
          <AlertTriangle className="h-3.5 w-3.5" /> {snap.saveError}
        </div>
      )}

      {/* Phones: sections stack at natural height and the page scrolls. Desktop: fixed workstation. */}
      <div className="flex shrink-0 flex-col lg:min-h-0 lg:flex-1 lg:shrink lg:flex-row">
        <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
          <div className="flex h-[58vh] min-h-[320px] shrink-0 flex-col lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink lg:flex-row">
            <DrawingTools
              tool={tool}
              onTool={chooseTool}
              stay={stay}
              onStay={(v) => {
                setStay(v);
                writeNumber("replay-stay", v ? 1 : 0);
              }}
              canUndo={histCounts.past > 0}
              canRedo={histCounts.future > 0}
              onUndo={undo}
              onRedo={redo}
              hidden={Boolean(prefs.hideDrawings)}
              onHidden={(v) => controller.setChartPrefs({ hideDrawings: v })}
              shading={Boolean(prefs.sessionShading)}
              onShading={(v) => controller.setChartPrefs({ sessionShading: v })}
              selectionLocked={selected ? Boolean(selected.locked) : null}
              onToggleLock={() => selected && updateDrawing({ ...selected, locked: !selected.locked })}
              onDeleteSelected={() => selectedDrawing && deleteDrawing(selectedDrawing)}
              onClearAll={async () => {
                const ok = await confirm({ title: "Remove all drawings", message: `Remove all ${snap.session.drawings.length} drawings from this session? You can undo this.`, confirmText: "Remove", destructive: true });
                if (ok) changeDrawings([]);
              }}
              onShortcuts={() => setShortcutsOpen(true)}
              count={snap.session.drawings.length}
            />
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
                onSelectDrawing={setSelectedDrawing}
                onAction={onAction}
                onContextMenu={(e) => !snap.atEnd && setMenu({ e, items: menuItems(e) })}
                onDrawingsChange={changeDrawings}
                hideDrawings={Boolean(prefs.hideDrawings)}
                sessionShading={Boolean(prefs.sessionShading)}
                autoScroll={prefs.autoScroll !== false}
                onAutoScroll={(v) => controller.setChartPrefs({ autoScroll: v })}
                handleRef={chartHandle}
              />
              {selected && !prefs.hideDrawings && (
                <DrawingSettingsBar drawing={selected} onChange={updateDrawing} onDuplicate={() => duplicateDrawing(selected)} onDelete={() => deleteDrawing(selected.id)} />
              )}
              {snap.atEnd && (
                <div className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs shadow-lg">
                  <Flag className="h-3.5 w-3.5 text-accent" /> End of session range.
                  <Link href={`/replay/analytics?session=${snap.session.id}`} className="font-semibold text-accent hover:underline">
                    View analytics
                  </Link>
                </div>
              )}
            </div>
          </div>
          {!bottomCollapsed && (
            <div className="hidden h-1.5 shrink-0 cursor-row-resize border-t border-border bg-surface hover:bg-accent/20 lg:block" onPointerDown={startResize} role="separator" aria-orientation="horizontal" aria-label="Resize bottom panel" />
          )}
          <div className={cn("relative shrink-0 border-t border-border bg-card", bottomCollapsed ? "h-9 overflow-hidden" : "h-[320px] lg:h-[var(--bottom-h)] lg:border-t-0")} style={{ "--bottom-h": `${bottomH}px` } as React.CSSProperties}>
            <button
              type="button"
              className="absolute right-2 top-1.5 z-10 hidden rounded-md bg-card px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground lg:block"
              onClick={() => {
                setBottomCollapsed((v) => {
                  writeNumber("replay-bottom-collapsed", v ? 0 : 1);
                  return !v;
                });
              }}
              aria-expanded={!bottomCollapsed}
              data-testid="bottom-toggle"
            >
              {bottomCollapsed ? "Show panel ▴" : "Hide ▾"}
            </button>
            <BottomPanel snap={snap} onSubmit={submit} onOpenJournal={openJournal} onNotes={(n) => controller.setNotes(n)} />
          </div>
        </div>

        {ticketOpen && (
          <div
            className="hidden w-1.5 shrink-0 cursor-col-resize border-l border-border bg-surface hover:bg-accent/20 lg:block"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize order panel"
            onPointerDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = rightW;
              const clamp = (w: number) => Math.max(280, Math.min(520, w));
              const move = (ev: PointerEvent) => setRightW(clamp(startW + (startX - ev.clientX)));
              const up = (ev: PointerEvent) => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                writeNumber("replay-right-w", clamp(startW + (startX - ev.clientX)));
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          />
        )}
        <aside className={cn("w-full shrink-0 space-y-3 border-t border-border bg-surface p-3 lg:w-[var(--right-w)] lg:overflow-y-auto lg:border-t-0", !ticketOpen && "lg:hidden")} style={{ "--right-w": `${rightW}px` } as React.CSSProperties} aria-label="Order panel"
          onMouseEnter={() => setTicketActive(true)}
          onMouseLeave={() => setTicketActive(false)}
          onFocus={() => setTicketActive(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTicketActive(false);
          }}
        >
          <AccountStrip snap={snap} />
          <OrderTicket
            snap={snap}
            ticket={ticket}
            derived={derived}
            onChange={setTicket}
            onSubmit={placeOrder}
            submitting={submitting}
            pick={pick}
            onPick={(p) => {
              setTool("cursor");
              setPick(p);
            }}
            onRiskChange={(patch) => controller.updatePreferences(patch)}
          />
          <p className="border-t border-border pt-2 text-[10px] leading-snug text-faint">
            Charts by{" "}
            <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="underline">
              TradingView
            </a>{" "}
            Lightweight Charts™. Data: {controller.dataset.provider ? "FXCM historical candles (personal use)" : "your imported files"}, stored in your database.
          </p>
        </aside>
      </div>

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts" size="md">
        <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2" data-testid="shortcuts">
          {(
            [
              ["Space", "Play / pause"],
              ["→", "Next candle"],
              ["Shift + →", "Next 1-minute step inside the candle"],
              ["←", "Previous candle (asks before undoing trades)"],
              ["Ctrl/⌘ + Z", "Undo drawing change"],
              ["Ctrl/⌘ + Shift + Z", "Redo drawing change"],
              ["Delete", "Delete selected drawing"],
              ["Enter", "Place order from selected position tool"],
              ["Esc", "Cancel tool / deselect"],
              ["Right-click", "Orders at a price · drawing menu"],
              ...DRAWING_TOOLS.filter((t) => t.key).map((t) => [t.key!, t.label] as [string, string]),
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

      {menu && <ChartContextMenu x={menu.e.clientX} y={menu.e.clientY} title={`At ${menu.e.price.toFixed(snap.spec.digits)}`} items={menu.items} onClose={() => setMenu(null)} />}
      {placing && snap.session.drawings.some((d) => d.id === placing) && (
        <ProjectionOrderModal
          snap={snap}
          drawing={snap.session.drawings.find((d) => d.id === placing)!}
          onClose={() => setPlacing(null)}
          onSubmit={(cmd) => {
            const r = submit(cmd);
            if (r.ok) {
              // The projection becomes the live position/order.
              changeDrawings(controller.session.drawings.filter((d) => d.id !== placing));
              setSelectedDrawing(null);
              toast.success(cmd.type === "market" ? "Order filled" : "Order placed");
            }
            return r;
          }}
        />
      )}
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
