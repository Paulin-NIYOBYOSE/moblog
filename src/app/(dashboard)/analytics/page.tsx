"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarDays, SlidersHorizontal } from "lucide-react";
import { useData } from "@/lib/useData";
import CustomSelect from "@/components/CustomSelect";
import { useSelectedAccount } from "@/components/AccountContext";
import { useModal } from "@/components/ModalContext";
import Analytics from "@/components/Analytics";
import StatCards from "@/components/StatCards";
import Calendar from "@/components/Calendar";
import DayPanel from "@/components/DayPanel";
import { cn, computeStats, dateKey } from "@/lib/utils";
import type { Trade } from "@/lib/types";

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
      <div className="h-8 w-40 animate-pulse rounded-lg bg-card" />
      <div className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />
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
  const [direction, setDirection] = useState<"ALL" | "LONG" | "SHORT">("ALL");
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

  const stats = useMemo(
    () => computeStats(filteredTrades, selectedAccount?.startingBalance ?? 0),
    [filteredTrades, selectedAccount],
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-0.5 text-sm text-muted">
            {selectedAccount ? selectedAccount.name : "Loading accounts..."}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
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
              "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors",
              showFilters
                ? "bg-surface-2 text-foreground"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-3">
            <CustomSelect
              value={direction}
              onChange={(v) => setDirection(v as any)}
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
        )}
      </div>

      {loading ? (
        <div className="space-y-5">
          <div className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
          <div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />
        </div>
      ) : (
        <div className="space-y-5">
          <StatCards stats={stats} />

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">Calendar</h3>
            </div>
            <Calendar
              trades={filteredTrades}
              onSelectDay={selectDay}
              initialMonth={initialMonth}
            />
          </div>

          <Analytics stats={stats} trades={filteredTrades} />
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
