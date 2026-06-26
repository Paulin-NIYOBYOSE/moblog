"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarDays, SlidersHorizontal } from "lucide-react";
import { useData } from "@/lib/useData";
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
  const { selectedAccount, setSelectedAccountId } = useSelectedAccount(accounts);
  const { openEdit, openAdd } = useModal();
  const searchParams = useSearchParams();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [direction, setDirection] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
    if (dateFrom)
      list = list.filter(
        (t) => dateKey(new Date(t.closeDate || t.openDate)) >= dateFrom,
      );
    if (dateTo)
      list = list.filter(
        (t) => dateKey(new Date(t.closeDate || t.openDate)) <= dateTo,
      );
    return list;
  }, [trades, selectedAccount, direction, dateFrom, dateTo]);

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
          <select
            value={selectedAccount?.id || ""}
            onChange={(e) => setSelectedAccountId(e.target.value || null)}
            className="input w-48"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
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
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}
              className="input"
            >
              <option value="ALL">All directions</option>
              <option value="LONG">Long only</option>
              <option value="SHORT">Short only</option>
            </select>
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
            <Calendar trades={filteredTrades} onSelectDay={selectDay} />
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
