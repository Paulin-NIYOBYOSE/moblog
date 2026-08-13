"use client";

import { Target } from "lucide-react";
import type { BacktestingSummary } from "@/lib/types";
import { DAILY_TARGET, formatDateLong } from "@/lib/backtesting";
import Card from "@/components/ui/Card";

export default function OverallProgressCard({ summary }: { summary: BacktestingSummary }) {
  const { completed, total, percent, expectedCompletionDate } = summary;

  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Overall Progress</span>
        <span className="text-sm font-semibold text-accent">{percent.toFixed(2)}% of goal</span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{completed}</span>
        <span className="text-xl font-medium text-muted">/ {total}</span>
        <span className="ml-1 text-sm text-muted">pair-years completed</span>
      </div>

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Target: {DAILY_TARGET} pair-years per day
        </span>
        <span>
          Expected completion:{" "}
          <span className="font-medium text-foreground">
            {expectedCompletionDate ? formatDateLong(expectedCompletionDate) : "Complete!"}
          </span>
        </span>
      </div>
    </Card>
  );
}
