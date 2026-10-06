"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, BarChart3, CalendarDays, CalendarRange, Hash, LayoutGrid, SlidersHorizontal, TrendingDown } from "lucide-react";
import { useData } from "@/lib/useData";
import CustomSelect from "@/components/CustomSelect";
import { useSelectedAccount } from "@/components/AccountContext";
import { useModal } from "@/components/ModalContext";
import Analytics from "@/components/Analytics";
import StatCards from "@/components/StatCards";
import Calendar from "@/components/Calendar";
import DayPanel from "@/components/DayPanel";
import MonthlyMatrix from "@/components/MonthlyMatrix";
import Card, { CardHeader } from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import PeriodFilter from "@/components/ui/PeriodFilter";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Skeleton from "@/components/ui/Skeleton";
import DrawdownChart from "@/components/charts/DrawdownChart";
import RMultipleHistogram from "@/components/charts/RMultipleHistogram";
import WeekdayBars from "@/components/charts/WeekdayBars";
import {
  BreakdownTable,
  EdgeScoreCard,
  HoldingTimeCard,
  KpiHero,
  LongShortCard,
  PnlDistributionCard,
  PnlTimeline,
  YearInTrading,
  YearlyDistribution,
} from "@/components/analytics/Widgets";
import { cn, computeStats, dateKey, formatCurrency, todayKey } from "@/lib/utils";
import { periodLabel, periodRange, type Period } from "@/lib/periods";
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

function periodFromMonth(month: string | null): Period {
  return month && /^\d{4}-\d{2}$/.test(month) ? { preset: "month", anchor: `${month}-01` } : { preset: "all", anchor: todayKey() };
}

function AnalyticsPageInner() {
  const { accounts, trades, loading, error } = useData();
  const { selectedAccount, setSelectedAccountId } = useSelectedAccount(accounts);
  const { openEdit, openAdd } = useModal();
  const searchParams = useSearchParams();
  const router = useRouter();

  const monthParam = searchParams.get("month");
  const [period, setPeriod] = useState<Period>(() => periodFromMonth(monthParam));
  const [direction, setDirection] = useState<Direction>("ALL");
  const [setup, setSetup] = useState("");
  const [pair, setPair] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Keep the period in sync when ?month= changes from elsewhere (e.g. the
  // dashboard's monthly chart deep-links here).
  useEffect(() => {
    if (!monthParam) return;
    setPeriod((p) => (p.preset === "month" && p.anchor.slice(0, 7) === monthParam ? p : periodFromMonth(monthParam)));
  }, [monthParam]);

  useEffect(() => {
    const date = searchParams.get("date");
    if (date) {
      setSelectedDay(date);
      setDayPanelOpen(true);
    }
  }, [searchParams]);

  function handlePeriodChange(next: Period) {
    setPeriod(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next.preset === "month") params.set("month", next.anchor.slice(0, 7));
    else params.delete("month");
    params.delete("date");
    const qs = params.toString();
    router.replace(qs ? `/analytics?${qs}` : "/analytics", { scroll: false });
  }

  const accountTrades = useMemo(
    () => (selectedAccount ? trades.filter((t) => t.accountId === selectedAccount.id) : trades),
    [trades, selectedAccount],
  );
  const setups = useMemo(() => Array.from(new Set(accountTrades.map((t) => t.setup).filter(Boolean) as string[])).sort(), [accountTrades]);
  const pairs = useMemo(() => Array.from(new Set(accountTrades.map((t) => t.pair))).sort(), [accountTrades]);

  const range = useMemo(() => periodRange(period), [period]);
  const filteredTrades = useMemo(() => {
    let list: Trade[] = accountTrades;
    if (direction !== "ALL") list = list.filter((t) => t.direction === direction);
    if (setup) list = list.filter((t) => t.setup === setup);
    if (pair) list = list.filter((t) => t.pair === pair);
    if (range) {
      list = list.filter((t) => {
        const key = dateKey(new Date(t.closeDate || t.openDate));
        return key >= range.from && key <= range.to;
      });
    }
    return list;
  }, [accountTrades, direction, setup, pair, range]);

  const startingBalance = selectedAccount?.startingBalance ?? 0;
  const stats = useMemo(() => computeStats(filteredTrades, startingBalance), [filteredTrades, startingBalance]);
  const drawdown = useMemo(() => computeDrawdown(filteredTrades, startingBalance), [filteredTrades, startingBalance]);
  const rDistribution = useMemo(() => computeRMultipleDistribution(filteredTrades), [filteredTrades]);
  const weekdayData = useMemo(() => aggregateByWeekday(filteredTrades), [filteredTrades]);
  const monthlyMatrix = useMemo(() => monthlyReturnMatrix(filteredTrades, startingBalance), [filteredTrades, startingBalance]);

  const calendarMonth = period.preset === "month" ? period.anchor.slice(0, 7) : range ? range.to.slice(0, 7) : undefined;
  const activeExtra = (setup ? 1 : 0) + (pair ? 1 : 0);

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
      <PageHeader
        eyebrow={
          <>
            <BarChart3 className="h-3 w-3" /> Performance intelligence
          </>
        }
        title="Analytics"
        subtitle={
          selectedAccount
            ? `${selectedAccount.name} · ${periodLabel(period)} · ${stats.closedTrades} closed trade${stats.closedTrades === 1 ? "" : "s"}`
            : "Loading accounts..."
        }
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
            <CustomSelect value={setup} onChange={setSetup} options={[{ value: "", label: "All setups" }, ...setups.map((s) => ({ value: s, label: s }))]} />
            <CustomSelect value={pair} onChange={setPair} options={[{ value: "", label: "All symbols" }, ...pairs.map((p) => ({ value: p, label: p }))]} />
            {(setup || pair) && (
              <button
                type="button"
                onClick={() => {
                  setSetup("");
                  setPair("");
                }}
                className="btn btn-ghost justify-start"
              >
                Clear extra filters
              </button>
            )}
          </div>
        }
      >
        <CustomSelect
          value={selectedAccount?.id || ""}
          onChange={(v) => setSelectedAccountId(v || null)}
          options={[{ value: "", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
          className="w-44"
        />
        <PeriodFilter value={period} onChange={handlePeriodChange} />
        <SegmentedControl
          options={[
            { value: "ALL", label: "All sides" },
            { value: "LONG", label: "Long" },
            { value: "SHORT", label: "Short" },
          ]}
          value={direction}
          onChange={setDirection}
        />
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={cn("btn btn-secondary ml-auto", showFilters && "border-accent/50 text-accent")}
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeExtra > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{activeExtra}</span>}
        </button>
      </FilterBar>

      {loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="space-y-5">
          <KpiHero stats={stats} trades={filteredTrades} />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <EdgeScoreCard trades={filteredTrades} startingBalance={startingBalance} />
            <div className="xl:col-span-2">
              <PnlTimeline trades={filteredTrades} onSelectDay={selectDay} />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2 px-1">
              <LayoutGrid className="h-3.5 w-3.5 text-muted" />
              <span className="eyebrow">All metrics</span>
            </div>
            <StatCards stats={stats} trades={filteredTrades} startingBalance={startingBalance} />
          </div>

          <Card id="calendar" scrollMt padding="lg">
            <CardHeader icon={CalendarDays} title="Calendar" subtitle="Daily results with weekly totals — click a day to see its trades" />
            <Calendar trades={filteredTrades} onSelectDay={selectDay} initialMonth={calendarMonth} />
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card padding="lg">
              <CardHeader
                icon={TrendingDown}
                tone="loss"
                title="Drawdown"
                subtitle={`Max ${drawdown.maxDrawdown > 0 ? `${drawdown.maxDrawdownPct.toFixed(1)}%` : "0%"} from peak · ${drawdown.longestDrawdownDays} day longest streak underwater`}
              />
              <DrawdownChart series={drawdown.series} />
            </Card>

            <Card padding="lg">
              <CardHeader icon={Hash} title="R-multiple distribution" subtitle="Closed trades with a recorded R:R" />
              <RMultipleHistogram data={rDistribution} />
            </Card>
          </div>

          <YearInTrading trades={filteredTrades} onSelectDay={selectDay} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <YearlyDistribution trades={filteredTrades} />
            <LongShortCard trades={filteredTrades} startingBalance={startingBalance} />
          </div>

          <Card padding="lg">
            <CardHeader icon={CalendarRange} title="Monthly returns" subtitle={`% return per month, relative to starting balance ${formatCurrency(startingBalance)}`} />
            <MonthlyMatrix rows={monthlyMatrix} />
          </Card>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <BreakdownTable trades={filteredTrades} />
            </div>
            <Analytics stats={stats} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <HoldingTimeCard trades={filteredTrades} />
            <PnlDistributionCard trades={filteredTrades} />
            <Card padding="lg">
              <CardHeader icon={CalendarDays} title="Performance by weekday" subtitle="Net P&L per day of the week" />
              <WeekdayBars data={weekdayData} />
            </Card>
          </div>
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
