"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, FlaskConical, NotebookPen } from "lucide-react";
import { computeV2Summary, plannedDate } from "@/lib/backtestV2";
import type { BtItem, JournalEntry } from "@/lib/types";
import { cn, todayKey } from "@/lib/utils";

/**
 * Today's to-dos at a glance: has today been journaled, and which Backtesting
 * v2 session is next. Fetches quietly — the dashboard never shows an error
 * because of it.
 */
export default function TodayStrip() {
  const [journaled, setJournaled] = useState<boolean | null>(null);
  const [items, setItems] = useState<BtItem[] | null>(null);
  const today = todayKey();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/journal", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((list: JournalEntry[] | null) => !cancelled && list && setJournaled(list.some((e) => e.day === today)))
      .catch(() => {});
    fetch("/api/backtesting-v2/items", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((list: BtItem[] | null) => !cancelled && list && setItems(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [today]);

  if (journaled === null && items === null) return null;
  const summary = items ? computeV2Summary(items, today) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {journaled !== null && (
        <Link
          href={journaled ? "/daily-journal?view=entries" : "/daily-journal?new=1"}
          className="group flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-md"
        >
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", journaled ? "bg-profit-soft text-profit" : "bg-accent-soft text-accent")}>
            {journaled ? <CheckCircle2 className="h-5 w-5" /> : <NotebookPen className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow flex items-center gap-1.5">
              <BookOpen className="h-3 w-3" /> Journal
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold">{journaled ? "Today is journaled — nice." : "Write today's entry"}</span>
          </span>
          <ArrowRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      )}
      {summary && (
        <Link
          href="/backtesting-v2"
          className="group flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold">
            <FlaskConical className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow">Backtesting v2 · {summary.completed}/{summary.total}</span>
            <span className="mt-0.5 block truncate text-sm font-semibold">
              {summary.today
                ? summary.daysUntilStart > 0
                  ? `Starts in ${summary.daysUntilStart} days · ${summary.today.instrument} ${summary.today.year}`
                  : `Today: ${summary.today.instrument} ${summary.today.year}${plannedDate(summary.today.sequence) < today ? " (catching up)" : ""}`
                : "All sessions complete"}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      )}
    </div>
  );
}
