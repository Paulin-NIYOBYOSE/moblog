"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, NotebookPen, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import { LegendItem } from "@/components/charts/kit";
import type { JournalRow } from "@/lib/journal";
import { cn, dateKey, formatSignedCurrency, MONTHS, todayKey } from "@/lib/utils";
import { MOOD_ICONS } from "./JournalEntryModal";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid joining the trade log and the journal: every day shows its P&L,
 * and journaled days carry the mood icon + a filled marker. Clicking a day
 * opens its entry, or starts one.
 */
export default function JournalCalendar({
  rowsByDay,
  dayPnl,
  initialMonth,
  onOpenDay,
}: {
  rowsByDay: Map<string, JournalRow[]>;
  dayPnl: Map<string, { pnl: number; trades: number }>;
  initialMonth?: string;
  onOpenDay: (day: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = (initialMonth ?? todayKey()).split("-").map(Number);
    return new Date(y, m - 1, 1);
  });
  const today = todayKey();

  const { cells, stats } = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const total = Math.ceil((offset + days) / 7) * 7;
    const cells: { key: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(y, m, i - offset + 1);
      cells.push({ key: dateKey(d), day: d.getDate(), inMonth: d.getMonth() === m });
    }
    let journaled = 0;
    let traded = 0;
    let pnl = 0;
    for (const c of cells) {
      if (!c.inMonth) continue;
      if (rowsByDay.has(c.key)) journaled++;
      const p = dayPnl.get(c.key);
      if (p) {
        traded++;
        pnl += p.pnl;
      }
    }
    return { cells, stats: { journaled, traded, pnl } };
  }, [cursor, rowsByDay, dayPnl]);

  return (
    <Card padding="lg">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl tracking-tight">
            {MONTHS[cursor.getMonth()]} <span className="text-muted">{cursor.getFullYear()}</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {stats.journaled} journaled · {stats.traded} trading days ·{" "}
            <span className={stats.pnl >= 0 ? "text-profit" : "text-loss"}>{formatSignedCurrency(stats.pnl)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 hidden gap-3 md:flex">
            <LegendItem color="var(--accent)" label="Journaled" />
            <LegendItem color="var(--profit)" label="Green day" />
            <LegendItem color="var(--loss)" label="Red day" />
          </div>
          <button type="button" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="btn btn-secondary btn-sm">
            Today
          </button>
          <div className="flex rounded-[0.6rem] border border-border">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              className="flex h-8 w-8 items-center justify-center text-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              className="flex h-8 w-8 items-center justify-center border-l border-border text-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {DOW.map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-faint">
            {d}
          </div>
        ))}
        {cells.map((c) => {
          if (!c.inMonth) return <div key={c.key} className="min-h-[74px] sm:min-h-[96px]" />;
          const rows = rowsByDay.get(c.key);
          const p = dayPnl.get(c.key);
          const mood = rows?.find((r) => r.entry.mood)?.entry.mood ?? null;
          const MoodIcon = mood ? MOOD_ICONS[mood - 1] : null;
          const imgs = rows?.reduce((s, r) => s + r.entry.attachments.length, 0) ?? 0;
          const tone = p ? (p.pnl > 0 ? "profit" : p.pnl < 0 ? "loss" : null) : null;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onOpenDay(c.key)}
              className={cn(
                "group relative flex min-h-[74px] min-w-0 flex-col justify-between overflow-hidden rounded-xl border p-1.5 text-left transition-all hover:-translate-y-px hover:shadow-md sm:min-h-[96px] sm:p-2.5",
                tone === "profit" && "border-profit/25 bg-profit-soft",
                tone === "loss" && "border-loss/25 bg-loss-soft",
                !tone && "border-border bg-surface hover:border-border-strong dark:bg-surface-2",
                c.key === today && "ring-1 ring-accent",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("text-xs font-semibold tabular-nums", c.key === today ? "text-accent" : "text-muted")}>{c.day}</span>
                {rows ? (
                  <span className="flex items-center gap-1">
                    {MoodIcon && <MoodIcon className="hidden h-3.5 w-3.5 text-foreground/70 sm:block" />}
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white">
                      <NotebookPen className="h-2.5 w-2.5" />
                    </span>
                  </span>
                ) : (
                  <Plus className="h-3.5 w-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </div>
              {p && (
                <div className="min-w-0">
                  <div className={cn("truncate text-[11px] font-semibold tabular-nums sm:text-sm", tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-muted")}>
                    {formatSignedCurrency(p.pnl, { compact: true })}
                  </div>
                  <div className="hidden truncate text-[10px] text-muted sm:block">
                    {p.trades} trade{p.trades === 1 ? "" : "s"}
                    {imgs > 0 && ` · ${imgs} img`}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
