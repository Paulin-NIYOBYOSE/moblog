"use client";

import { useMemo } from "react";
import { CalendarRange, Check, Grid3x3, Images, NotebookPen } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import { LegendItem } from "@/components/charts/kit";
import { completionsByDay, daysBetweenKeys, V2_END, V2_START, V2_TOTAL, V2_YEARS } from "@/lib/backtestV2";
import type { BtItem } from "@/lib/types";
import { cn, dateKey, MONTHS } from "@/lib/utils";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

function MonthGrid({
  year,
  month,
  items,
  today,
  doneOn,
}: {
  year: number;
  month: number;
  items: BtItem[];
  today: string;
  doneOn: Map<string, BtItem[]>;
}) {
  const bySeq = useMemo(() => new Map(items.map((i) => [i.sequence, i])), [items]);
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
    const d = i - offset + 1;
    return d >= 1 && d <= days ? dateKey(new Date(year, month, d)) : null;
  });

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-2xl tracking-tight">{MONTHS[month]}</h3>
        <span className="text-xs text-muted">{year}</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {DOW.map((d, i) => (
          <div key={i} className="pb-1 text-center text-[10px] font-semibold text-faint">
            {d}
          </div>
        ))}
        {cells.map((key, i) => {
          if (!key) return <div key={`e${i}`} />;
          const seq = daysBetweenKeys(V2_START, key);
          const inWindow = key >= V2_START && key <= V2_END;
          const item = inWindow ? bySeq.get(seq) : undefined;
          const buffer = inWindow && seq >= V2_TOTAL;
          const isToday = key === today;
          const past = key < today;
          const completedCount = doneOn.get(key)?.length ?? 0;
          const state = !inWindow ? "out" : buffer ? "buffer" : item?.completed ? "done" : past ? "missed" : isToday ? "today" : "upcoming";
          return (
            <div
              key={key}
              title={item ? `${item.instrument} ${item.year}` : buffer ? "Buffer day" : undefined}
              className={cn(
                "relative flex min-h-[64px] flex-col justify-between rounded-xl border p-1.5 text-left sm:min-h-[72px] sm:p-2",
                state === "out" && "border-transparent opacity-40",
                state === "done" && "border-profit/30 bg-profit-soft",
                state === "missed" && "border-loss/25 bg-loss-soft",
                state === "today" && "border-accent bg-accent-soft",
                state === "upcoming" && "border-border bg-surface dark:bg-surface-2",
                state === "buffer" && "border-gold/30",
                isToday && "ring-1 ring-accent",
              )}
              style={state === "buffer" ? { background: "repeating-linear-gradient(135deg, var(--gold-soft) 0 5px, transparent 5px 10px)" } : undefined}
            >
              <div className="flex items-center justify-between">
                <span className={cn("text-[11px] font-semibold tabular-nums", isToday ? "text-accent" : "text-muted")}>{Number(key.slice(8))}</span>
                {state === "done" && <Check className="h-3 w-3 text-profit" strokeWidth={3} />}
                {completedCount > 0 && state !== "done" && (
                  <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-profit px-0.5 text-[8px] font-bold text-white">{completedCount}</span>
                )}
              </div>
              {item && (
                <div className="min-w-0">
                  <div className={cn("truncate text-[10.5px] font-semibold tracking-tight", state === "done" && "text-profit", state === "missed" && "text-loss")}>
                    {item.instrument}
                  </div>
                  <div className="text-[9.5px] text-muted">{item.year}</div>
                </div>
              )}
              {buffer && <div className="text-[9.5px] font-semibold uppercase tracking-wide text-gold">Buffer</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function V2Schedule({
  items,
  today,
  onToggle,
  onOpenPair,
}: {
  items: BtItem[];
  today: string;
  onToggle: (item: BtItem) => void;
  onOpenPair: (instrument: string) => void;
}) {
  const doneOn = useMemo(() => completionsByDay(items), [items]);
  const pairs = useMemo(() => {
    const map = new Map<string, BtItem[]>();
    for (const i of items) {
      const arr = map.get(i.instrument) ?? [];
      arr.push(i);
      map.set(i.instrument, arr);
    }
    return Array.from(map.entries()).map(([instrument, list]) => ({
      instrument,
      items: list.sort((a, b) => a.year - b.year),
      done: list.filter((i) => i.completed).length,
    }));
  }, [items]);

  return (
    <div className="space-y-5">
      <Card padding="lg">
        <CardHeader
          icon={CalendarRange}
          title="Schedule"
          subtitle="One pair-year a day — the plan finishes Dec 26 with 5 buffer days to spare"
          action={
            <div className="hidden flex-wrap gap-3 md:flex">
              <LegendItem color="var(--profit)" label="Done" />
              <LegendItem color="var(--loss)" label="Missed" />
              <LegendItem color="var(--accent)" label="Today" />
              <LegendItem color="var(--gold)" label="Buffer" />
            </div>
          }
        />
        <div className="grid gap-8 lg:grid-cols-2">
          <MonthGrid year={2026} month={10} items={items} today={today} doneOn={doneOn} />
          <MonthGrid year={2026} month={11} items={items} today={today} doneOn={doneOn} />
        </div>
      </Card>

      <Card padding="lg">
        <CardHeader icon={Grid3x3} title="Pair board" subtitle="Tap a year to mark it done · open a pair to record its results" />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {pairs.map((p) => {
            const hasNotes = p.items.some((i) => i.notes);
            const imgs = p.items.reduce((s, i) => s + i.attachments.length, 0);
            return (
              <div
                key={p.instrument}
                className={cn("rounded-xl border p-3 transition-colors", p.done === V2_YEARS.length ? "border-profit/30 bg-profit-soft/60" : "border-border bg-surface-2")}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button type="button" onClick={() => onOpenPair(p.instrument)} className="group flex items-center gap-1.5 text-sm font-semibold tracking-tight hover:text-accent">
                    {p.instrument}
                    <NotebookPen className="h-3.5 w-3.5 text-faint group-hover:text-accent" />
                  </button>
                  <span className="flex items-center gap-2 text-[11px] tabular-nums text-muted">
                    {(hasNotes || imgs > 0) && (
                      <span className="flex items-center gap-0.5 text-accent" title="Has results">
                        <Images className="h-3 w-3" />
                        {imgs || ""}
                      </span>
                    )}
                    {p.done}/{V2_YEARS.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {p.items.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => onToggle(i)}
                      title={i.completed ? "Mark not done" : "Mark done"}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors",
                        i.completed ? "border-profit/40 bg-card" : "border-border bg-card hover:border-border-strong",
                      )}
                    >
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full", i.completed ? "bg-profit text-white" : "border border-border-strong")}>
                        {i.completed && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                      </span>
                      <span className="text-xs font-semibold">{i.year}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
