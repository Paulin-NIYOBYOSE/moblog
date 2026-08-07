"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarDays, Hash, SlidersHorizontal, TrendingDown } from "lucide-react";
import { useData } from "@/lib/useData";
import CustomSelect from "@/components/CustomSelect";
import { useSelectedAccount } from "@/components/AccountContext";
import { useModal } from "@/components/ModalContext";
import Analytics from "@/components/Analytics";
import StatCards from "@/components/StatCards";
import Calendar from "@/components/Calendar";
import DayPanel from "@/components/DayPanel";
import MonthlyMatrix from "@/components/MonthlyMatrix";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import Skeleton from "@/components/ui/Skeleton";
import DrawdownChart from "@/components/charts/DrawdownChart";
import RMultipleHistogram from "@/components/charts/RMultipleHistogram";
import WeekdayBars from "@/components/charts/WeekdayBars";
import { cn, computeStats, dateKey, formatCurrency } from "@/lib/utils";
import {
  aggregateByWeekday,
  computeDrawdown,
  computeRMultipleDistribution,
  monthlyReturnMatrix,
} from "@/lib/analytics";
import type { Trade } from "@/lib/types";

type Direction = "ALL" | "LONG" | "SHORT";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<AnalyticsLoading />}>
      <AnalyticsPageInner />
    </Suspense>
  );
}

function AnalyticsLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28" />
      <Skeleton className="h-96" />
    </div>
  );
}

function AnalyticsPageInner() {
  const { accounts, trades, loading, error } = useData();
  const { selectedAccount, setSelectedAccountId } =
    useSelectedAccount(accounts);
  const { openEdit, openAdd } = useModal();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [direction, setDirection] = useState<Direction>("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const initialMonth = searchParams.get("month") ?? undefined;

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) {
      if (t.closeDate) {
        const d = new Date(t.closeDate);
        set.add(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        );
      }
      const od = new Date(t.openDate);
      set.add(
        `${od.getFullYear()}-${String(od.getMonth() + 1).padStart(2, "0")}`,
      );
    }
    const sorted = Array.from(set).sort().reverse();
    return [
      { value: "", label: "All months" },
      ...sorted.map((m) => {
        const [year, month] = m.split("-");
        const date = new Date(Number(year), Number(month) - 1, 1);
        return {
          value: m,
          label: date.toLocaleString("default", {
            month: "long",
            year: "numeric",
          }),
        };
      }),
    ];
  }, [trades]);

  useEffect(() => {
    const date = searchParams.get("date");
    if (date) {
      setSelectedDay(date);
      setDayPanelOpen(true);
    }
  }, [searchParams]);

  const filteredTrades = useMemo(() => {
    let list = selectedAccount
      ? trades.filter((t) => t.accountId === selectedAccount.id)
      : trades;
    if (direction !== "ALL")
      list = list.filter((t) => t.direction === direction);
    if (initialMonth) {
      list = list.filter((t) => {
        const d = new Date(t.closeDate || t.openDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === initialMonth;
      });
    }
    if (dateFrom)
      list = list.filter(
        (t) => dateKey(new Date(t.closeDate || t.openDate)) >= dateFrom,
      );
    if (dateTo)
      list = list.filter(
        (t) => dateKey(new Date(t.closeDate || t.openDate)) <= dateTo,
      );
    return list;
  }, [trades, selectedAccount, direction, initialMonth, dateFrom, dateTo]);

  const startingBalance = selectedAccount?.startingBalance ?? 0;
  const stats = useMemo(
    () => computeStats(filteredTrades, startingBalance),
    [filteredTrades, startingBalance],
  );
  const drawdown = useMemo(
    () => computeDrawdown(filteredTrades, startingBalance),
    [filteredTrades, startingBalance],
  );
  const rDistribution = useMemo(
    () => computeRMultipleDistribution(filteredTrades),
    [filteredTrades],
  );
  const weekdayData = useMemo(() => aggregateByWeekday(filteredTrades), [filteredTrades]);
  const monthlyMatrix = useMemo(
    () => monthlyReturnMatrix(filteredTrades, startingBalance),
    [filteredTrades, startingBalance],
  );

  function selectDay(day: string) {
    setSelectedDay(day);
    setDayPanelOpen(true);
  }

  function handleEdit(trade: Trade) {
    setDayPanelOpen(false);
    openEdit(trade);
  }

  function handleMonthChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("month", value);
    } else {
      params.delete("month");
    }
    params.delete("date");
    router.replace(`/analytics?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle={selectedAccount ? selectedAccount.name : "Loading accounts..."}
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <FilterBar
        expanded={showFilters}
        expandedContent={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <CustomSelect
              value={direction}
              onChange={(v) => setDirection(v as Direction)}
              options={[
                { value: "ALL", label: "All directions" },
                { value: "LONG", label: "Long only" },
                { value: "SHORT", label: "Short only" },
              ]}
            />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input"
              placeholder="From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input"
              placeholder="To"
            />
          </div>
        }
      >
        <CustomSelect
          value={selectedAccount?.id || ""}
          onChange={(v) => setSelectedAccountId(v || null)}
          options={[
            { value: "", label: "All accounts" },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
          className="w-48"
        />
        <CustomSelect
          value={initialMonth || ""}
          onChange={handleMonthChange}
          options={monthOptions}
          className="w-48"
        />
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={cn(
            "ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors",
            showFilters
              ? "bg-surface-2 text-foreground"
              : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
      </FilterBar>

      {loading ? (
        <div className="space-y-5">
          <Skeleton className="h-28" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="space-y-5">
          <StatCards stats={stats} trades={filteredTrades} startingBalance={startingBalance} />

          <Card id="calendar" scrollMt padding="lg">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">Calendar</h3>
            </div>
            <Calendar
              trades={filteredTrades}
              onSelectDay={selectDay}
              initialMonth={initialMonth}
            />
          </Card>

          <Analytics stats={stats} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card padding="lg">
              <div className="mb-1 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-loss" />
                <h3 className="text-sm font-semibold">Drawdown</h3>
              </div>
              <p className="mb-3 text-xs text-muted">
                Max {drawdown.maxDrawdown > 0 ? `${drawdown.maxDrawdownPct.toFixed(1)}%` : "0%"} from
                peak · {drawdown.longestDrawdownDays} day longest streak underwater
              </p>
              <DrawdownChart series={drawdown.series} />
            </Card>

            <Card padding="lg">
              <div className="mb-1 flex items-center gap-2">
                <Hash className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold">R-multiple distribution</h3>
              </div>
              <p className="mb-3 text-xs text-muted">Closed trades with a recorded R:R</p>
              <RMultipleHistogram data={rDistribution} />
            </Card>
          </div>

          <Card padding="lg">
            <div className="mb-1 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">Monthly returns</h3>
            </div>
            <p className="mb-3 text-xs text-muted">
              % return per month, relative to starting balance {formatCurrency(startingBalance)}
            </p>
            <MonthlyMatrix rows={monthlyMatrix} />
          </Card>

          <Card padding="lg">
            <h3 className="mb-3 text-sm font-semibold">Performance by weekday</h3>
            <WeekdayBars data={weekdayData} />
          </Card>
        </div>
      )}

      <DayPanel
        open={dayPanelOpen}
        day={selectedDay}
        trades={filteredTrades}
        onClose={() => setDayPanelOpen(false)}
        onAddForDay={(day) => openAdd(day)}
        onEditTrade={handleEdit}
      />
    </div>
  );
}
