"use client";

import { useState } from "react";
import { ArrowRight, CalendarClock, Check, CheckCircle2, Crosshair, Flame, Hourglass, Layers, NotebookPen, Trophy, Undo2 } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { AttachmentField, AttachmentStrip } from "@/components/ui/Attachments";
import { ProgressRing } from "@/components/charts/kit";
import {
  daysBetweenKeys,
  plannedDate,
  V2_BUFFER_DAYS,
  V2_END,
  V2_START,
  V2_STATUS_LABEL,
  V2_TOTAL,
  V2_WINDOW_DAYS,
  type V2Summary,
} from "@/lib/backtestV2";
import { formatDateLong } from "@/lib/backtesting";
import type { BtItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function shortDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_TONE: Record<V2Summary["status"], "accent" | "profit" | "loss" | "gold" | "muted"> = {
  not_started: "muted",
  ahead: "profit",
  on_track: "accent",
  behind: "loss",
  complete: "gold",
};

// ---------------------------------------------------------------------------
// Hero — overall progress + the Nov 1 → Dec 31 timeline
// ---------------------------------------------------------------------------

export function V2Hero({ summary, today }: { summary: V2Summary; today: string }) {
  const planEnd = plannedDate(V2_TOTAL - 1);
  const pos = (key: string) => Math.min(100, Math.max(0, (daysBetweenKeys(V2_START, key) / (V2_WINDOW_DAYS - 1)) * 100));
  const inWindow = today >= V2_START && today <= V2_END;
  const bufferStart = pos(planEnd) + 100 / (V2_WINDOW_DAYS - 1);

  return (
    <Card padding="none" className="overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(600px 220px at 0% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%), radial-gradient(500px 200px at 100% 100%, color-mix(in srgb, var(--gold) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex items-center gap-5">
          <ProgressRing percent={summary.percent} size={124} stroke={10} color={summary.status === "complete" ? "var(--gold)" : "var(--accent)"}>
            <span className="text-3xl font-semibold tracking-tight">{Math.round(summary.percent)}%</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">complete</span>
          </ProgressRing>
          <div className="lg:hidden">
            <HeroCount summary={summary} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="hidden lg:block">
            <HeroCount summary={summary} />
          </div>
          <div className="mt-6">
            <div className="mb-1.5 flex justify-between text-[11px] font-medium text-muted">
              <span>Nov 1</span>
              <span>Dec 1</span>
              <span>Dec 31</span>
            </div>
            <div className="relative h-3 w-full rounded-full bg-surface-3">
              <div className="absolute inset-y-0 left-0 rounded-l-full bg-accent/15" style={{ width: `${bufferStart}%` }} />
              <div
                className="absolute inset-y-0 rounded-r-full"
                style={{ left: `${bufferStart}%`, right: 0, background: "repeating-linear-gradient(135deg, var(--gold-soft) 0 4px, transparent 4px 8px)" }}
                title={`${V2_BUFFER_DAYS} buffer days`}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-700"
                style={{ width: `${(summary.completed / V2_TOTAL) * bufferStart}%` }}
              />
              {inWindow && (
                <div className="absolute -top-1.5 bottom-[-6px] w-0.5 rounded-full bg-foreground" style={{ left: `calc(${pos(today)}% - 1px)` }}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1 text-[9px] font-bold text-background">TODAY</span>
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent" /> 1 pair-year a day → done {shortDate(planEnd)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-gold" /> {V2_BUFFER_DAYS} buffer days
              </span>
              {summary.expectedCompletion && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-foreground" /> At this pace: {shortDate(summary.expectedCompletion)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          <HeroStat icon={CalendarClock} label={summary.daysUntilStart > 0 ? "Starts in" : "Days left"} value={`${summary.daysUntilStart > 0 ? summary.daysUntilStart : summary.windowDaysLeft}d`} />
          <HeroStat icon={Hourglass} label="Buffer" value={`${Math.max(0, summary.bufferLeft)}d`} tone={summary.bufferLeft < 0 ? "loss" : undefined} />
          <HeroStat icon={Flame} label="Streak" value={`${summary.streak}d`} tone={summary.streak > 0 ? "gold" : undefined} />
          <HeroStat icon={Layers} label="Remaining" value={String(summary.remaining)} />
        </div>
      </div>
    </Card>
  );
}

function HeroCount({ summary }: { summary: V2Summary }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[summary.status]}>{V2_STATUS_LABEL[summary.status]}</Badge>
        <span className="text-xs text-muted">Nov 1 → Dec 31, 2026 · years 2024 & 2025</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight sm:text-5xl">{summary.completed}</span>
        <span className="text-lg font-medium text-muted">/ {summary.total}</span>
        <span className="text-sm text-muted">pair-years done</span>
      </div>
    </div>
  );
}

function HeroStat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone?: "loss" | "gold" }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 px-3 py-2.5 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn("mt-0.5 text-lg font-semibold", tone === "loss" && "text-loss", tone === "gold" && "text-gold")}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

export function V2TodayCard({
  summary,
  lastDone,
  today,
  onDone,
  onUndo,
  onOpenPair,
}: {
  summary: V2Summary;
  lastDone: BtItem | null;
  today: string;
  onDone: (item: BtItem) => void;
  onUndo: (item: BtItem) => void;
  onOpenPair: (instrument: string) => void;
}) {
  const item = summary.today;
  if (!item) {
    return (
      <Card padding="lg" className="flex h-full flex-col items-center justify-center text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft text-gold">
          <Trophy className="h-6 w-6" />
        </span>
        <p className="font-display text-2xl">All 56 pair-years done</p>
        <p className="mt-1 text-sm text-muted">The full 2024–2025 DRIPDOLLAR backtest is complete.</p>
      </Card>
    );
  }
  const planned = plannedDate(item.sequence);
  const beforeStart = summary.daysUntilStart > 0;
  const lateBy = beforeStart ? 0 : daysBetweenKeys(planned, today);
  const doneToday = summary.completedToday > 0;

  return (
    <Card padding="lg" className="flex h-full flex-col">
      <CardHeader
        icon={Crosshair}
        title={beforeStart ? "First session" : doneToday ? "Done for today" : "Today's session"}
        subtitle={
          beforeStart
            ? `Planned for ${formatDateLong(planned)}`
            : lateBy > 0
            ? `Planned ${shortDate(planned)} · ${lateBy} day${lateBy === 1 ? "" : "s"} behind`
            : `Planned ${shortDate(planned)}`
        }
        action={
          doneToday && (
            <Badge tone="profit" icon={CheckCircle2}>
              Today done
            </Badge>
          )
        }
      />
      <div className="flex flex-1 flex-col justify-center">
        <div className="text-xs font-medium text-muted">{doneToday ? "Next up" : "Backtest"}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <span className="font-display text-5xl leading-none tracking-tight sm:text-6xl">{item.instrument}</span>
          <span className="rounded-lg border border-border bg-surface-2 px-2 py-0.5 text-lg font-semibold">{item.year}</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          Session {item.sequence + 1} of {V2_TOTAL} — backtest the whole year, then mark it done.
        </p>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <button type="button" onClick={() => onDone(item)} className="btn btn-primary py-3 text-[0.95rem]">
          <Check className="h-4.5 w-4.5" strokeWidth={2.5} /> Mark {item.instrument} {item.year} done
        </button>
        <button type="button" onClick={() => onOpenPair(item.instrument)} className="btn btn-secondary py-3">
          <NotebookPen className="h-4 w-4" /> Pair results
        </button>
      </div>
      {lastDone && (
        <button type="button" onClick={() => onUndo(lastDone)} className="mt-3 flex items-center gap-1.5 self-start text-xs text-muted hover:text-foreground">
          <Undo2 className="h-3.5 w-3.5" /> Undo {lastDone.instrument} {lastDone.year}
        </button>
      )}
    </Card>
  );
}

export function V2UpNext({ summary }: { summary: V2Summary }) {
  return (
    <Card padding="lg" className="h-full">
      <CardHeader icon={ArrowRight} tone="muted" title="Up next" subtitle="The queue after today" />
      {summary.nextUp.length === 0 ? (
        <p className="text-sm text-muted">Nothing queued — you&apos;re at the end of the plan.</p>
      ) : (
        <div className="space-y-2">
          {summary.nextUp.map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-card text-[11px] font-bold text-muted shadow-card">{i.sequence + 1}</span>
              <div>
                <div className="text-sm font-semibold">
                  {i.instrument} <span className="font-normal text-muted">· {i.year}</span>
                </div>
                <div className="text-[11px] text-muted">Planned {shortDate(plannedDate(i.sequence))}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pair results — record each pair once both years are backtested
// ---------------------------------------------------------------------------

interface PairHandlers {
  onToggle: (item: BtItem) => void;
  onSaveNotes: (item: BtItem, notes: string) => void;
  onAddImages: (item: BtItem, files: File[]) => void;
  onRemoveImage: (item: BtItem, id: string) => Promise<void>;
  onEditImage: (item: BtItem, id: string, patch: { name?: string; caption?: string }) => Promise<void>;
}

function YearPanel({ item, onToggle, onSaveNotes, onAddImages, onRemoveImage, onEditImage }: { item: BtItem } & PairHandlers) {
  // Remounted (via key) whenever the saved notes change, so no sync effect.
  const [notes, setNotes] = useState(item.notes ?? "");
  const dirty = notes !== (item.notes ?? "");
  return (
    <div className="rounded-2xl border border-border bg-surface-2/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-2xl">{item.year}</span>
        <button type="button" onClick={() => onToggle(item)} className={cn("btn btn-sm", item.completed ? "bg-profit-soft text-profit" : "btn-secondary")}>
          {item.completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {item.completed ? "Done" : "Mark done"}
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => dirty && onSaveNotes(item, notes)}
        rows={3}
        placeholder="Results & observations — win rate, net R, what stood out…"
        className="input resize-y text-sm"
      />
      <div className="mt-3 space-y-2">
        {item.attachments.length > 0 && (
          <AttachmentStrip attachments={item.attachments} size="sm" onDelete={(id) => onRemoveImage(item, id)} onEdit={(id, patch) => onEditImage(item, id, patch)} />
        )}
        <AttachmentField pending={[]} onPendingChange={(files) => onAddImages(item, files)} listenPaste={false} hint="Results screenshots — uploads immediately" />
      </div>
    </div>
  );
}

export function V2PairModal({ instrument, items, onClose, ...handlers }: { instrument: string | null; items: BtItem[]; onClose: () => void } & PairHandlers) {
  const list = items.filter((i) => i.instrument === instrument).sort((a, b) => a.year - b.year);
  const done = list.filter((i) => i.completed).length;
  return (
    <Modal
      open={Boolean(instrument)}
      onClose={onClose}
      size="lg"
      icon={NotebookPen}
      title={`${instrument ?? ""} results`}
      subtitle={`${done}/${list.length} years backtested — record the pair once both years are done. Notes save when you click away.`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {list.map((item) => (
          <YearPanel key={`${item.id}:${item.notes ?? ""}`} item={item} {...handlers} />
        ))}
      </div>
    </Modal>
  );
}
