"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DayAggregate, Trade } from "@/lib/types";
import {
  MONTHS,
  WEEKDAYS,
  aggregateByDay,
  cn,
  dateKey,
  formatSignedCurrency,
} from "@/lib/utils";

interface CalendarProps {
  trades: Trade[];
  onSelectDay: (dateKey: string) => void;
  initialMonth?: string; // yyyy-mm
}

interface Cell {
  key: string;
  dateKey: string;
  day: number;
  inMonth: boolean;
  agg?: DayAggregate;
  isToday: boolean;
}

export default function Calendar({
  trades,
  onSelectDay,
  initialMonth,
}: CalendarProps) {
  const [cursor, setCursor] = useState(() => {
    if (initialMonth) {
      const [year, month] = initialMonth.split("-").map(Number);
      if (year && month && month >= 1 && month <= 12) {
        return new Date(year, month - 1, 1);
      }
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (initialMonth) {
      const [year, month] = initialMonth.split("-").map(Number);
      if (year && month && month >= 1 && month <= 12) {
        setCursor(new Date(year, month - 1, 1));
      }
    }
  }, [initialMonth]);

  const aggMap = useMemo(() => {
    const map = new Map<string, DayAggregate>();
    for (const d of aggregateByDay(trades)) map.set(d.date, d);
    return map;
  }, [trades]);

  const todayString = dateKey(new Date());

  const { weeks, monthNet, activeDays } = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    const cells: Cell[] = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - firstDay + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      const date = new Date(year, month, dayNum);
      const key = dateKey(date);
      cells.push({
        key: `${i}`,
        dateKey: key,
        day: dayNum,
        inMonth,
        agg: inMonth ? aggMap.get(key) : undefined,
        isToday: inMonth && key === todayString,
      });
    }

    const weeks: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    let monthNet = 0;
    let activeDays = 0;
    for (const c of cells) {
      if (c.agg) {
        monthNet += c.agg.pnl;
        activeDays += 1;
      }
    }
    return { weeks, monthNet, activeDays };
  }, [cursor, aggMap, todayString]);

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }
  function goToday() {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  return (
    <div
      id="calendar"
      className="rounded-2xl border border-border bg-card p-4 sm:p-5 scroll-mt-20"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="hidden rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm font-medium tabular-nums sm:inline-block"
            style={{ color: monthNet >= 0 ? "var(--profit)" : "var(--loss)" }}
          >
            {formatSignedCurrency(monthNet)}
          </span>
          <span className="hidden rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm text-muted sm:inline-block">
            {activeDays} day{activeDays === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-2"
          >
            Today
          </button>
          <div className="flex items-center rounded-lg border border-border">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(7,1fr)_minmax(64px,0.8fr)] gap-1.5 sm:gap-2">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="pb-1 text-center text-xs font-medium text-muted"
          >
            {d}
          </div>
        ))}
        <div className="pb-1 text-center text-xs font-medium text-muted">
          Week
        </div>

        {weeks.map((week, wi) => {
          const weekNet = week.reduce((sum, c) => sum + (c.agg?.pnl ?? 0), 0);
          const weekDays = week.filter((c) => c.agg).length;
          return (
            <DayRow
              key={wi}
              week={week}
              weekNet={weekNet}
              weekDays={weekDays}
              onSelectDay={onSelectDay}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayRow({
  week,
  weekNet,
  weekDays,
  onSelectDay,
}: {
  week: Cell[];
  weekNet: number;
  weekDays: number;
  onSelectDay: (key: string) => void;
}) {
  return (
    <>
      {week.map((cell) => (
        <DayCell key={cell.key} cell={cell} onSelectDay={onSelectDay} />
      ))}
      <div className="flex flex-col justify-center rounded-lg bg-surface-2 px-2 py-2 text-right">
        {weekDays > 0 ? (
          <>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: weekNet >= 0 ? "var(--profit)" : "var(--loss)" }}
            >
              {formatSignedCurrency(weekNet, { compact: true })}
            </span>
            <span className="text-[11px] text-muted">{weekDays}d</span>
          </>
        ) : (
          <span className="text-[11px] text-muted">—</span>
        )}
      </div>
    </>
  );
}

function DayCell({
  cell,
  onSelectDay,
}: {
  cell: Cell;
  onSelectDay: (key: string) => void;
}) {
  if (!cell.inMonth) {
    return <div className="min-h-[68px] rounded-lg sm:min-h-[84px]" />;
  }

  const agg = cell.agg;
  const positive = (agg?.pnl ?? 0) >= 0;
  const winRate =
    agg && agg.trades ? Math.round((agg.wins / agg.trades) * 100) : 0;

  return (
    <button
      type="button"
      onClick={() => onSelectDay(cell.dateKey)}
      className={cn(
        "group min-h-[68px] rounded-lg border p-1.5 text-left transition-all sm:min-h-[84px] sm:p-2",
        agg
          ? "border-transparent"
          : "border-border bg-surface hover:bg-surface-2",
        cell.isToday && "ring-1 ring-accent",
      )}
      style={
        agg
          ? {
              backgroundColor: positive
                ? "var(--profit-soft)"
                : "var(--loss-soft)",
              boxShadow: `inset 0 0 0 1px ${positive ? "var(--profit)" : "var(--loss)"}33`,
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-xs tabular-nums",
            cell.isToday ? "font-semibold text-accent" : "text-muted",
          )}
        >
          {cell.day}
        </span>
      </div>
      {agg && (
        <div className="mt-1.5">
          <div
            className="text-[13px] font-semibold leading-tight tabular-nums sm:text-sm"
            style={{ color: positive ? "var(--profit)" : "var(--loss)" }}
          >
            {formatSignedCurrency(agg.pnl, { compact: true })}
          </div>
          <div className="mt-0.5 text-[10px] text-muted sm:text-[11px]">
            {agg.trades} trade{agg.trades === 1 ? "" : "s"} · {winRate}%
          </div>
        </div>
      )}
    </button>
  );
}
