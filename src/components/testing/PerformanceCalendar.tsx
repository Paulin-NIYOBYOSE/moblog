"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CustomSelect from "@/components/CustomSelect";
import type { BacktestTrade } from "@/lib/testing/types";
import { aggregateByDay, aggregateByMonth, type DayAggregate } from "@/lib/testing/stats";
import { MONTHS, WEEKDAYS, cn, dateKey, formatSignedCurrency, formatSignedPercent } from "@/lib/utils";

type Metric = "PROFIT" | "PERCENT" | "TRADES";
type BalanceMode = "INITIAL" | "CURRENT";
type ViewMode = "MONTH" | "YEAR";

interface Cell {
  key: string;
  dateKey: string;
  day: number;
  inMonth: boolean;
  agg?: DayAggregate;
  isToday: boolean;
}

function cellDisplay(agg: DayAggregate | undefined, metric: Metric, divisor: number) {
  if (!agg) return null;
  if (metric === "TRADES") return `${agg.trades}`;
  if (metric === "PERCENT") return formatSignedPercent(divisor ? (agg.pnl / divisor) * 100 : 0, 1);
  return formatSignedCurrency(agg.pnl, { compact: true });
}

export default function PerformanceCalendar({
  trades,
  startingBalance,
}: {
  trades: BacktestTrade[];
  startingBalance: number;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [metric, setMetric] = useState<Metric>("PROFIT");
  const [balanceMode, setBalanceMode] = useState<BalanceMode>("INITIAL");
  const [view, setView] = useState<ViewMode>("MONTH");

  const aggMap = useMemo(() => {
    const map = new Map<string, DayAggregate>();
    for (const d of aggregateByDay(trades)) map.set(d.date, d);
    return map;
  }, [trades]);

  const monthlyAgg = useMemo(() => aggregateByMonth(trades), [trades]);

  const todayString = dateKey(new Date());

  // Running balance at the start of each day, for the "Current Balance" divisor.
  const runningBalanceByDay = useMemo(() => {
    const days = aggregateByDay(trades).sort((a, b) => a.date.localeCompare(b.date));
    const map = new Map<string, number>();
    let running = startingBalance;
    for (const d of days) {
      map.set(d.date, running);
      running += d.pnl;
    }
    return map;
  }, [trades, startingBalance]);

  function divisorFor(dateStr: string) {
    return balanceMode === "INITIAL" ? startingBalance : runningBalanceByDay.get(dateStr) ?? startingBalance;
  }

  const { weeks, monthNet } = useMemo(() => {
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
    for (const c of cells) if (c.agg) monthNet += c.agg.pnl;
    return { weeks, monthNet };
  }, [cursor, aggMap, todayString]);

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }
  function shiftYear(delta: number) {
    setCursor((c) => new Date(c.getFullYear() + delta, c.getMonth(), 1));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CustomSelect
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          className="w-40"
          options={[
            { value: "PROFIT", label: "Dollar Profit" },
            { value: "PERCENT", label: "Return %" },
            { value: "TRADES", label: "Trade count" },
          ]}
        />
        <div className="flex items-center gap-4">
          <RadioOption active={balanceMode === "INITIAL"} label="Initial Balance" onClick={() => setBalanceMode("INITIAL")} />
          <RadioOption active={balanceMode === "CURRENT"} label="Current Balance" onClick={() => setBalanceMode("CURRENT")} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {view === "MONTH" ? (
            <>
              <h4 className="text-base font-semibold tracking-tight">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </h4>
              <div className="flex items-center rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <h4 className="text-base font-semibold tracking-tight">{cursor.getFullYear()}</h4>
              <div className="flex items-center rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => shiftYear(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftYear(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
          {view === "MONTH" && (
            <span
              className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm font-medium tabular-nums"
              style={{ color: monthNet >= 0 ? "var(--profit)" : "var(--loss)" }}
            >
              {formatSignedCurrency(monthNet)}
            </span>
          )}
        </div>
        <div className="flex items-center rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("MONTH")}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              view === "MONTH" ? "bg-card text-foreground shadow-sm" : "text-muted",
            )}
          >
            Month
          </button>
          <button
            type="button"
            onClick={() => setView("YEAR")}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              view === "YEAR" ? "bg-card text-foreground shadow-sm" : "text-muted",
            )}
          >
            Year
          </button>
        </div>
      </div>

      {view === "MONTH" ? (
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-1 text-center text-xs font-medium text-muted">
              {d}
            </div>
          ))}
          {weeks.map((week, wi) =>
            week.map((cell) => (
              <DayCell key={`${wi}-${cell.key}`} cell={cell} metric={metric} divisorFor={divisorFor} />
            )),
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MONTHS.map((label, i) => {
            const m = monthlyAgg.find((a) => a.month === `${cursor.getFullYear()}-${String(i + 1).padStart(2, "0")}`);
            const positive = (m?.pnl ?? 0) >= 0;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setCursor(new Date(cursor.getFullYear(), i, 1));
                  setView("MONTH");
                }}
                className="flex flex-col items-start gap-1 rounded-xl border border-border p-3 text-left transition-colors hover:bg-surface-2"
                style={m ? { backgroundColor: positive ? "var(--profit-soft)" : "var(--loss-soft)" } : undefined}
              >
                <span className="text-xs font-medium text-muted">{label}</span>
                {m ? (
                  <>
                    <span
                      className="text-sm font-semibold tabular-nums"
                      style={{ color: positive ? "var(--profit)" : "var(--loss)" }}
                    >
                      {formatSignedCurrency(m.pnl, { compact: true })}
                    </span>
                    <span className="text-[11px] text-muted">{m.trades} trades</span>
                  </>
                ) : (
                  <span className="text-sm text-muted">—</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RadioOption({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
    >
      <span
        className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-full border", active ? "border-accent" : "border-border")}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      </span>
      <span className={active ? "text-foreground" : undefined}>{label}</span>
    </button>
  );
}

function DayCell({
  cell,
  metric,
  divisorFor,
}: {
  cell: Cell;
  metric: Metric;
  divisorFor: (dateStr: string) => number;
}) {
  if (!cell.inMonth) return <div className="min-h-[68px] rounded-lg sm:min-h-[84px]" />;

  const agg = cell.agg;
  const positive = (agg?.pnl ?? 0) >= 0;
  const display = cellDisplay(agg, metric, divisorFor(cell.dateKey));

  return (
    <div
      className={cn(
        "min-h-[68px] min-w-0 overflow-hidden rounded-lg border p-1.5 text-left sm:min-h-[84px] sm:p-2",
        agg ? "border-transparent" : "border-border bg-surface",
        cell.isToday && "ring-1 ring-accent",
      )}
      style={
        agg
          ? {
              backgroundColor: positive ? "var(--profit-soft)" : "var(--loss-soft)",
              boxShadow: `inset 0 0 0 1px ${positive ? "var(--profit)" : "var(--loss)"}33`,
            }
          : undefined
      }
    >
      <span className={cn("text-xs tabular-nums", cell.isToday ? "font-semibold text-accent" : "text-muted")}>
        {cell.day}
      </span>
      {agg && (
        <div className="mt-1.5 min-w-0">
          <div
            className="truncate text-[13px] font-semibold leading-tight tabular-nums sm:text-sm"
            style={{ color: positive ? "var(--profit)" : "var(--loss)" }}
          >
            {display}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-muted sm:text-[11px]">
            {agg.trades} trade{agg.trades === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}
