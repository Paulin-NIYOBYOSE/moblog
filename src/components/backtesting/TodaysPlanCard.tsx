"use client";

import { useState } from "react";
import { Check, PartyPopper } from "lucide-react";
import type { BacktestItem } from "@/lib/types";
import { DAILY_TARGET } from "@/lib/backtesting";
import { cn } from "@/lib/utils";
import Card from "@/components/ui/Card";

export default function TodaysPlanCard({
  items,
  onToggle,
  onCompleteAll,
}: {
  items: BacktestItem[];
  onToggle: (id: string, completed: boolean) => void;
  onCompleteAll: (ids: string[]) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const pending = items.filter((i) => !i.completed);
  const allDone = items.length > 0 && pending.length === 0;

  if (items.length === 0) {
    return (
      <Card padding="lg" className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-profit-soft text-profit">
          <PartyPopper className="h-5 w-5" />
        </div>
        <p className="text-sm font-semibold">All 168 pair-years backtested</p>
        <p className="mt-1 text-sm text-muted">You&apos;ve completed the full plan. Nice work.</p>
      </Card>
    );
  }

  async function handleCompleteAll() {
    setSubmitting(true);
    try {
      await onCompleteAll(pending.map((i) => i.id));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card padding="lg">
      <h2 className="text-base font-semibold tracking-tight">Today&apos;s Plan</h2>
      <p className="mt-0.5 text-sm text-muted">
        {allDone
          ? "Today's pair-years are done."
          : `Do ${DAILY_TARGET} pair-years today to stay on track.`}
      </p>

      <div className="mt-4 space-y-2">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id, !item.completed)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
              item.completed
                ? "border-profit/30 bg-profit-soft"
                : "border-border bg-surface-2 hover:border-accent/40",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                item.completed ? "bg-profit text-white" : "bg-surface text-muted",
              )}
            >
              {item.completed ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn("text-sm font-medium", item.completed && "text-muted line-through")}>
              {item.instrument} {item.year}
            </span>
          </button>
        ))}
      </div>

      {!allDone && (
        <button
          type="button"
          onClick={handleCompleteAll}
          disabled={submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-transform hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          Mark Today&apos;s Work as Completed
        </button>
      )}
    </Card>
  );
}
