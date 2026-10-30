"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, BarChart3, NotebookTabs, PiggyBank, StickyNote, Wallet } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import Card from "@/components/ui/Card";
import AnalyticsTab from "@/components/notebook/AnalyticsTab";
import BudgetTab from "@/components/notebook/BudgetTab";
import NotesTab from "@/components/notebook/NotesTab";
import SavingsTab from "@/components/notebook/SavingsTab";
import { NOTEBOOK_TABS, type NotebookTab } from "@/components/notebook/tabs";
import { monthOf } from "@/lib/notebook";
import { sayingOfMonth } from "@/lib/sayings";
import { useNotebook } from "@/lib/useNotebook";
import { cn, todayKey } from "@/lib/utils";

const TABS: { value: NotebookTab; label: string; short?: string; icon: React.ElementType }[] = [
  { value: "budget", label: "Budget", icon: Wallet },
  { value: "savings", label: "General savings", short: "Savings", icon: PiggyBank },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
  { value: "notes", label: "Notes", icon: StickyNote },
];

export default function NotebookPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <NotebookInner />
    </Suspense>
  );
}

function NotebookInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nb = useNotebook();
  const [today] = useState(todayKey);
  const param = searchParams.get("tab") as NotebookTab | null;
  const tab: NotebookTab = param && NOTEBOOK_TABS.includes(param) ? param : "budget";
  const saying = sayingOfMonth(monthOf(today));

  function go(next: NotebookTab) {
    router.replace(next === "budget" ? "/notebook" : `/notebook?tab=${next}`, { scroll: false });
  }

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <NotebookTabs className="h-3.5 w-3.5" /> Personal
          </>
        }
        title="Notebook"
        subtitle={
          <span data-testid="saying">
            “{saying.text}”{saying.meaning && ` (${saying.meaning})`} <span className="whitespace-nowrap text-faint">— {saying.author}</span>
          </span>
        }
      />
      <nav role="tablist" aria-label="Notebook" className="mb-5 grid grid-cols-4 gap-1 rounded-2xl border border-border bg-surface-2 p-1 sm:inline-grid">
        {TABS.map((t) => {
          const active = t.value === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={t.label}
              onClick={() => go(t.value)}
              className={cn(
                // Icon above the label on phones, so all four fit on one row.
                "flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[0.8rem] font-medium transition-colors sm:flex-row sm:gap-1.5 sm:px-4 sm:py-2",
                active ? "border border-border bg-card text-foreground shadow-sm" : "border border-transparent text-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", active && "text-accent")} />
              {t.short ? (
                <>
                  <span className="sm:hidden">{t.short}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </>
              ) : (
                t.label
              )}
            </button>
          );
        })}
      </nav>
      {nb.loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      ) : !nb.data ? (
        <Card className="mx-auto max-w-lg text-center">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-loss" />
          <p className="text-sm font-semibold">The notebook couldn&apos;t be loaded</p>
          <p className="mt-1 text-sm text-muted">{nb.error}</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => void nb.refresh()}>
            Try again
          </button>
        </Card>
      ) : tab === "savings" ? (
        <SavingsTab nb={nb} today={today} />
      ) : tab === "analytics" ? (
        <AnalyticsTab nb={nb} today={today} />
      ) : tab === "notes" ? (
        <NotesTab nb={nb} today={today} />
      ) : (
        <BudgetTab nb={nb} today={today} />
      )}
    </div>
  );
}
