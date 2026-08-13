"use client";

import { useMemo } from "react";
import { CalendarCheck, CalendarClock, Flame, ListChecks, TrendingUp } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatTile from "@/components/ui/StatTile";
import Skeleton from "@/components/ui/Skeleton";
import { useBacktestingData } from "@/lib/useBacktestingData";
import { computeBacktestingSummary, groupByInstrument, STATUS_LABEL, DAILY_TARGET, formatDateLong } from "@/lib/backtesting";
import { todayKey } from "@/lib/utils";
import OverallProgressCard from "@/components/backtesting/OverallProgressCard";
import TodaysPlanCard from "@/components/backtesting/TodaysPlanCard";
import NextUpCard from "@/components/backtesting/NextUpCard";
import HistoryCalendar from "@/components/backtesting/HistoryCalendar";
import InstrumentGrid from "@/components/backtesting/InstrumentGrid";

export default function BacktestingPage() {
  const { items, loading, setCompleted, completeMany } = useBacktestingData();
  const today = todayKey();

  const summary = useMemo(() => computeBacktestingSummary(items, today), [items, today]);
  const instruments = useMemo(() => groupByInstrument(items), [items]);

  const statusAccent =
    summary.status === "ahead" ? "profit" : summary.status === "behind" ? "loss" : "accent";

  if (loading) {
    return (
      <div>
        <PageHeader title="Backtesting Series" subtitle="Track your 2020–2025 backtesting journey across 28 instruments" />
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Backtesting Series"
        subtitle="Track your 2020–2025 backtesting journey across 28 instruments"
        actions={
          <span className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium">
            Today: {formatDateLong(today)}
          </span>
        }
      />

      <div className="space-y-5">
        <OverallProgressCard summary={summary} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Days Completed" icon={CalendarCheck} accent="accent">
            <div className="mt-2 text-2xl font-bold tabular-nums">{summary.daysCompleted}</div>
            <p className="mt-0.5 text-xs text-muted">Current streak: {summary.currentStreak}</p>
          </StatTile>
          <StatTile label="Today's Workload" icon={ListChecks} accent="info">
            <div className="mt-2 text-2xl font-bold tabular-nums">{DAILY_TARGET}</div>
            <p className="mt-0.5 text-xs text-muted">Pair-years</p>
          </StatTile>
          <StatTile label="Completed Today" icon={TrendingUp} accent="profit">
            <div className="mt-2 text-2xl font-bold tabular-nums">
              {summary.completedTodayCount} / {DAILY_TARGET}
            </div>
            <p className="mt-0.5 text-xs text-muted">Pair-years</p>
          </StatTile>
          <StatTile label="Days Remaining" icon={CalendarClock} accent="warning">
            <div className="mt-2 text-2xl font-bold tabular-nums">{summary.daysRemaining}</div>
            <p className="mt-0.5 text-xs text-muted">On track</p>
          </StatTile>
          <StatTile label="Status" icon={Flame} accent={statusAccent}>
            <div className="mt-2 text-2xl font-bold">{STATUS_LABEL[summary.status]}</div>
            <p className="mt-0.5 text-xs text-muted">
              {summary.status === "behind" ? "Catch up when you can" : "You're on pace"}
            </p>
          </StatTile>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TodaysPlanCard items={summary.todaysPlan} onToggle={setCompleted} onCompleteAll={completeMany} />
          <NextUpCard items={summary.nextUp} />
        </div>

        <HistoryCalendar items={items} todayKey={today} />

        <InstrumentGrid instruments={instruments} onToggle={setCompleted} />
      </div>
    </div>
  );
}
