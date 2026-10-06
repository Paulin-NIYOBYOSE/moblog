"use client";

import { Target } from "lucide-react";
import type { BacktestingSummary } from "@/lib/types";
import { DAILY_TARGET, formatDateLong } from "@/lib/backtesting";
import Card from "@/components/ui/Card";
import { ProgressRing } from "@/components/charts/kit";

export default function OverallProgressCard({ summary }: { summary: BacktestingSummary }) {
  const { completed, total, percent, expectedCompletionDate } = summary;

  return (
    <Card padding="none" className="overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: "radial-gradient(600px 220px at 0% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%)" }}
      />
      <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-7">
        <ProgressRing percent={percent} size={116} stroke={10}>
          <span className="text-2xl font-semibold tracking-tight">{percent.toFixed(0)}%</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">of goal</span>
        </ProgressRing>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="eyebrow">Overall progress</span>
            <span className="text-sm font-semibold text-accent">{percent.toFixed(2)}% of goal</span>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight sm:text-5xl">{completed}</span>
            <span className="text-xl font-medium text-muted">/ {total}</span>
            <span className="ml-1 text-sm text-muted">pair-years completed</span>
          </div>

          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-700"
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
        </div>
      </div>
    </Card>
  );
}
