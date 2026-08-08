"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, AlertTriangle, BarChart3, TrendingUp } from "lucide-react";
import { useTestingData } from "@/lib/useTestingData";
import { useToast } from "@/components/ToastContext";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import SegmentedControl from "@/components/ui/SegmentedControl";
import SectionTabs from "@/components/testing/SectionTabs";
import TestingFilterBar from "@/components/testing/TestingFilterBar";
import PerformanceTab from "@/components/testing/PerformanceTab";
import DrawdownTab from "@/components/testing/DrawdownTab";
import SimulationTab from "@/components/testing/SimulationTab";
import { defaultFilters, type TestingFilters } from "@/lib/testing/types";
import { applyTestingFilters } from "@/lib/testing/filter";
import { downloadCsv, tradesToCsv } from "@/lib/testing/csv";

type Tab = "PERFORMANCE" | "DRAWDOWN" | "SIMULATION";

function filtersToParams(filters: TestingFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status !== "ALL") params.set("status", filters.status);
  if (filters.sessionIds.length) params.set("sessions", filters.sessionIds.join(","));
  if (filters.assets.length) params.set("assets", filters.assets.join(","));
  if (filters.sides.length) params.set("sides", filters.sides.join(","));
  if (filters.outcomes.length) params.set("outcomes", filters.outcomes.join(","));
  if (filters.tags.length) params.set("tags", filters.tags.join(","));
  if (filters.strategies.length) params.set("strategies", filters.strategies.join(","));
  if (filters.weekdays.length) params.set("days", filters.weekdays.join(","));
  if (filters.timeFrom !== "00:00") params.set("timeFrom", filters.timeFrom);
  if (filters.timeTo !== "23:59") params.set("timeTo", filters.timeTo);
  if (filters.timezone !== "Etc/UTC") params.set("tz", filters.timezone);
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.breakevenThreshold) params.set("be", String(filters.breakevenThreshold));
  return params;
}

function paramsToFilters(params: URLSearchParams): TestingFilters {
  const base = defaultFilters();
  const split = (key: string) => params.get(key)?.split(",").filter(Boolean) ?? [];
  return {
    ...base,
    status: (params.get("status") as TestingFilters["status"]) || base.status,
    sessionIds: split("sessions"),
    assets: split("assets"),
    sides: split("sides") as TestingFilters["sides"],
    outcomes: split("outcomes") as TestingFilters["outcomes"],
    tags: split("tags"),
    strategies: split("strategies"),
    weekdays: split("days").map(Number),
    timeFrom: params.get("timeFrom") || base.timeFrom,
    timeTo: params.get("timeTo") || base.timeTo,
    timezone: params.get("tz") || base.timezone,
    dateFrom: params.get("from") || "",
    dateTo: params.get("to") || "",
    breakevenThreshold: Number(params.get("be")) || 0,
  };
}

export default function TestingAnalyticsPage() {
  return (
    <Suspense fallback={<AnalyticsLoading />}>
      <TestingAnalyticsPageInner />
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

function TestingAnalyticsPageInner() {
  const { sessions, trades, loading, error } = useTestingData();
  const toast = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [filters, setFilters] = useState<TestingFilters>(() => paramsToFilters(searchParams));
  const [tab, setTab] = useState<Tab>("PERFORMANCE");

  const sessionOptions = useMemo(
    () => sessions.map((s) => ({ value: s.id, label: s.name })),
    [sessions],
  );
  const assetOptions = useMemo(
    () => Array.from(new Set(trades.map((t) => t.pair))).sort(),
    [trades],
  );
  const tagOptions = useMemo(
    () => Array.from(new Set(trades.flatMap((t) => t.tags))).sort(),
    [trades],
  );
  const strategyOptions = useMemo(
    () => Array.from(new Set(trades.map((t) => t.setup).filter((s): s is string => Boolean(s)))).sort(),
    [trades],
  );

  const filteredTrades = useMemo(() => applyTestingFilters(trades, filters), [trades, filters]);

  const sessionsInScope = useMemo(
    () => (filters.sessionIds.length ? sessions.filter((s) => filters.sessionIds.includes(s.id)) : sessions),
    [sessions, filters.sessionIds],
  );
  const startingBalance = useMemo(
    () => sessionsInScope.reduce((sum, s) => sum + s.startingBalance, 0),
    [sessionsInScope],
  );

  const setBreakevenThreshold = useCallback(
    (value: number) => setFilters((f) => ({ ...f, breakevenThreshold: value })),
    [],
  );

  function handleDownload() {
    if (filteredTrades.length === 0) {
      toast.error("No trades match the current filters.");
      return;
    }
    downloadCsv("moblog-testing-export.csv", tradesToCsv(filteredTrades));
  }

  function handleShare() {
    const params = filtersToParams(filters);
    const qs = params.toString();
    const url = `${window.location.origin}/testing/analytics${qs ? `?${qs}` : ""}`;
    router.replace(`/testing/analytics${qs ? `?${qs}` : ""}`, { scroll: false });
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copied to clipboard"))
      .catch(() => toast.error("Couldn't copy link"));
  }

  return (
    <div>
      <PageHeader title="Testing" subtitle="Backtesting sessions & analytics" />
      <SectionTabs />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <TestingFilterBar
        filters={filters}
        onChange={setFilters}
        options={{ sessions: sessionOptions, assets: assetOptions, tags: tagOptions, strategies: strategyOptions }}
        onDownload={handleDownload}
        onShare={handleShare}
      />

      {loading ? (
        <div className="space-y-5">
          <Skeleton className="h-28" />
          <Skeleton className="h-96" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium">No sessions yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Create a backtesting session and upload or add trades from the Sessions tab to see
            analytics here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "PERFORMANCE", label: "Performance", icon: TrendingUp },
              { value: "DRAWDOWN", label: "Drawdown", icon: BarChart3 },
              { value: "SIMULATION", label: "Simulation", icon: Activity },
            ]}
          />

          {tab === "PERFORMANCE" && (
            <PerformanceTab
              trades={filteredTrades}
              sessions={sessionsInScope}
              startingBalance={startingBalance}
              breakevenThreshold={filters.breakevenThreshold}
              onBreakevenThresholdChange={setBreakevenThreshold}
            />
          )}
          {tab === "DRAWDOWN" && <DrawdownTab trades={filteredTrades} startingBalance={startingBalance} />}
          {tab === "SIMULATION" && <SimulationTab trades={filteredTrades} startingBalance={startingBalance} />}
        </div>
      )}
    </div>
  );
}
