"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BacktestItem, DayHistoryEntry } from "@/lib/types";
import { DAILY_TARGET, monthHistory } from "@/lib/backtesting";
import { MONTHS, WEEKDAYS, cn } from "@/lib/utils";
import Card from "@/components/ui/Card";

const STATUS_DOT: Record<DayHistoryEntry["status"], string> = {
  completed: "bg-profit",
  partial: "bg-warning",
  missed: "bg-loss",
  upcoming: "bg-border",
};

const STATUS_CARD: Record<DayHistoryEntry["status"], string> = {
  completed: "border-profit/30 bg-profit-soft",
  partial: "border-warning/30 bg-warning-soft",
  missed: "border-loss/30 bg-loss-soft",
  upcoming: "border-border bg-surface-2",
};

export default function HistoryCalendar({ items, todayKey }: { items: BacktestItem[]; todayKey: string }) {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayKey.split("-").map(Number);
    return new Date(y, m - 1, 1);
  });

  const days = useMemo(
    () => monthHistory(items, cursor.getFullYear(), cursor.getMonth(), todayKey),
    [items, cursor, todayKey],
  );

  const hasCompletedDay = days.some((d) => d.status === "completed" || d.status === "partial");

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }
  function goToday() {
    const [y, m] = todayKey.split("-").map(Number);
    setCursor(new Date(y, m - 1, 1));
  }

  return (
    <Card padding="lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Backtesting Calendar</h2>
          <p className="mt-0.5 text-sm text-muted">Your daily progress and completed pair-years</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-profit" /> Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warning" /> Partial
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-loss" /> Missed
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-surface-2"
            >
              This Month
            </button>
            <div className="flex items-center rounded-lg border border-border">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="flex h-7 w-7 items-center justify-center rounded-l-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="flex h-7 w-7 items-center justify-center rounded-r-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => {
          const [dy, dm, dd] = day.date.split("-").map(Number);
          const isToday = day.date === todayKey;
          const dow = WEEKDAYS[new Date(dy, dm - 1, dd).getDay()];
          return (
            <div
              key={day.date}
              className={cn(
                "flex min-w-[76px] shrink-0 flex-col items-center gap-1 rounded-xl border px-2.5 py-2.5 text-center",
                STATUS_CARD[day.status],
                isToday && "ring-1 ring-accent",
              )}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{dow}</span>
              <span className="text-sm font-semibold tabular-nums">{dd}</span>
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[day.status])} />
                {day.items.length}/{DAILY_TARGET}
              </span>
            </div>
          );
        })}
      </div>

      {!hasCompletedDay && (
        <p className="mt-4 text-center text-sm text-muted">
          No completed days yet — start by completing today&apos;s plan to see your progress here.
        </p>
      )}
    </Card>
  );
}
