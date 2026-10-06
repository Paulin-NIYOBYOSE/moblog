"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, BookMarked, BookOpen, CalendarDays, LayoutGrid, List, NotebookPen, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import StrategyPlaybook from "@/components/strategy/StrategyPlaybook";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import PeriodFilter from "@/components/ui/PeriodFilter";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Card from "@/components/ui/Card";
import { ChipGroup } from "@/components/ui/Inputs";
import CustomSelect from "@/components/CustomSelect";
import { useConfirm } from "@/components/ConfirmContext";
import JournalEntryModal from "@/components/journal/JournalEntryModal";
import { JournalEntryCard, JournalEntryDrawer } from "@/components/journal/JournalEntryViews";
import JournalOverview from "@/components/journal/JournalOverview";
import JournalCalendar from "@/components/journal/JournalCalendar";
import { useData } from "@/lib/useData";
import { useJournal } from "@/lib/useJournal";
import {
  allTags,
  buildRows,
  EMOTION_LABELS,
  filterEntries,
  journalStreak,
  MISTAKES,
  tradeDay,
  tradingDaysIn,
  type JournalFilters,
  type JournalRow,
} from "@/lib/journal";
import { monthLabel, periodLabel, periodRange, type Period } from "@/lib/periods";
import { cn, formatSignedCurrency, isClosed, todayKey } from "@/lib/utils";

type View = "overview" | "entries" | "calendar" | "playbook";

export default function DailyJournalPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <DailyJournalInner />
    </Suspense>
  );
}

function DailyJournalInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const { accounts, trades, loading: dataLoading } = useData();
  const { entries, loading, error, saveEntry, deleteEntry, removeImage, editImage } = useJournal();

  const view = (["overview", "entries", "calendar", "playbook"].includes(searchParams.get("view") ?? "") ? searchParams.get("view") : "overview") as View;
  const [period, setPeriod] = useState<Period>({ preset: "month", anchor: todayKey() });
  const [accountId, setAccountId] = useState("");
  const [search, setSearch] = useState("");
  const [emotions, setEmotions] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [plan, setPlan] = useState<JournalFilters["plan"]>("all");
  const [showFilters, setShowFilters] = useState(false);

  const [modal, setModal] = useState<{ open: boolean; entryId: string | null; day: string | null }>({ open: false, entryId: null, day: null });
  const [drawerId, setDrawerId] = useState<string | null>(null);

  function setView(next: View) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    params.delete("new");
    router.replace(`/daily-journal?${params.toString()}`, { scroll: false });
  }

  // Sidebar's "new entry" shortcut lands here with ?new=1.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setModal({ open: true, entryId: null, day: todayKey() });
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      router.replace(`/daily-journal${params.toString() ? `?${params}` : ""}`, { scroll: false });
    }
  }, [searchParams, router]);

  const scopeAccount = accountId || null;
  const range = useMemo(() => periodRange(period), [period]);
  const filters: JournalFilters = useMemo(
    () => ({ range, accountId: scopeAccount, search, emotions, mistakes, tags, plan }),
    [range, scopeAccount, search, emotions, mistakes, tags, plan],
  );

  const filtered = useMemo(() => filterEntries(entries, filters), [entries, filters]);
  const rows = useMemo(() => buildRows(filtered, trades, scopeAccount), [filtered, trades, scopeAccount]);
  const allRows = useMemo(
    () => buildRows(filterEntries(entries, { ...filters, range: null }), trades, scopeAccount),
    [entries, filters, trades, scopeAccount],
  );
  const accountEntries = useMemo(() => entries.filter((e) => !scopeAccount || !e.accountId || e.accountId === scopeAccount), [entries, scopeAccount]);
  const streak = useMemo(() => journalStreak(accountEntries, todayKey()), [accountEntries]);
  const tradingDays = useMemo(() => tradingDaysIn(trades, range, scopeAccount), [trades, range, scopeAccount]);
  const knownTags = useMemo(() => allTags(entries), [entries]);

  const rowsByDay = useMemo(() => {
    const map = new Map<string, JournalRow[]>();
    for (const r of buildRows(accountEntries, trades, scopeAccount)) {
      const arr = map.get(r.entry.day) ?? [];
      arr.push(r);
      map.set(r.entry.day, arr);
    }
    return map;
  }, [accountEntries, trades, scopeAccount]);

  const dayPnl = useMemo(() => {
    const map = new Map<string, { pnl: number; trades: number }>();
    for (const t of trades) {
      if (!isClosed(t) || (scopeAccount && t.accountId !== scopeAccount)) continue;
      const k = tradeDay(t);
      const cur = map.get(k) ?? { pnl: 0, trades: 0 };
      cur.pnl += t.pnl;
      cur.trades += 1;
      map.set(k, cur);
    }
    return map;
  }, [trades, scopeAccount]);

  const openDay = useCallback(
    (day: string) => {
      const existing = rowsByDay.get(day);
      if (existing?.length) setDrawerId(existing[0].entry.id);
      else setModal({ open: true, entryId: null, day });
    },
    [rowsByDay],
  );

  const drawerRow = useMemo(() => {
    if (!drawerId) return null;
    const e = entries.find((x) => x.id === drawerId);
    return e ? buildRows([e], trades, scopeAccount)[0] : null;
  }, [drawerId, entries, trades, scopeAccount]);
  const editingEntry = modal.entryId ? entries.find((e) => e.id === modal.entryId) ?? null : null;
  const accountName = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? null : null);

  const activeFilterCount = emotions.length + mistakes.length + tags.length + (plan !== "all" ? 1 : 0);

  // Entries grouped by month for the timeline view.
  const grouped = useMemo(() => {
    const map = new Map<string, JournalRow[]>();
    for (const r of rows) {
      const k = r.entry.day.slice(0, 7);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [rows]);

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: "Delete journal entry",
      message: "Delete this entry and its images? This cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await deleteEntry(id);
    setDrawerId(null);
  }

  const isLoading = loading || dataLoading;

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <BookOpen className="h-3 w-3" /> Reflect · Review · Improve
          </>
        }
        title="Journal"
        subtitle="One quick entry a day — mood, plan, your DRIPDOLLAR checklist, feelings and charts. The analytics show what actually moves your P&L."
        actions={
          <button type="button" onClick={() => setModal({ open: true, entryId: null, day: todayKey() })} className="btn btn-primary">
            <Plus className="h-4 w-4" /> New entry
          </button>
        }
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {view !== "playbook" && (
      <FilterBar
        expanded={showFilters}
        expandedContent={
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="eyebrow mb-2">Emotions</div>
              <ChipGroup options={EMOTION_LABELS} value={emotions} onChange={setEmotions} />
            </div>
            <div className="space-y-4">
              <div>
                <div className="eyebrow mb-2">Mistakes</div>
                <ChipGroup options={MISTAKES} value={mistakes} onChange={setMistakes} />
              </div>
              {knownTags.length > 0 && (
                <div>
                  <div className="eyebrow mb-2">Tags</div>
                  <ChipGroup options={knownTags} value={tags} onChange={setTags} />
                </div>
              )}
              <div>
                <div className="eyebrow mb-2">Plan</div>
                <SegmentedControl
                  options={[
                    { value: "all", label: "Any" },
                    { value: "followed", label: "Followed" },
                    { value: "broken", label: "Broken" },
                  ]}
                  value={plan}
                  onChange={setPlan}
                />
              </div>
            </div>
          </div>
        }
      >
        <PeriodFilter value={period} onChange={setPeriod} />
        <CustomSelect
          value={accountId}
          onChange={setAccountId}
          options={[{ value: "", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
          className="w-44"
        />
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes, lessons, tags…" className="input h-9 pl-9" />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={cn("btn btn-secondary", showFilters && "border-accent/50 text-accent")}
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeFilterCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{activeFilterCount}</span>
          )}
        </button>
      </FilterBar>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          size="md"
          options={[
            { value: "overview", label: "Overview", icon: LayoutGrid },
            { value: "entries", label: "Entries", icon: List },
            { value: "calendar", label: "Calendar", icon: CalendarDays },
            { value: "playbook", label: "Strategy", icon: BookMarked },
          ]}
          value={view}
          onChange={setView}
        />
        <p className={cn("text-xs text-muted", view === "playbook" && "hidden")}>
          {periodLabel(period)} · {rows.length} entr{rows.length === 1 ? "y" : "ies"}
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="ml-2 font-medium text-accent hover:underline"
              onClick={() => {
                setEmotions([]);
                setMistakes([]);
                setTags([]);
                setPlan("all");
              }}
            >
              Clear filters
            </button>
          )}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : view === "playbook" ? (
        <StrategyPlaybook />
      ) : entries.length === 0 && view !== "calendar" ? (
        <Card padding="lg">
          <EmptyState
            icon={NotebookPen}
            title="Start your trading journal"
            description="One quick entry per day — a few taps, a note and your charts. Your analytics build themselves from there."
            action={
              <button type="button" onClick={() => setModal({ open: true, entryId: null, day: todayKey() })} className="btn btn-primary">
                <Plus className="h-4 w-4" /> Write today&apos;s entry
              </button>
            }
          />
        </Card>
      ) : view === "overview" ? (
        <JournalOverview rows={rows} allRows={allRows} tradingDays={tradingDays} streak={streak} onSelectDay={openDay} />
      ) : view === "entries" ? (
        rows.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon={Search} title="No entries match" description="Try another period, account or filter." />
          </Card>
        ) : (
          <div className="space-y-8">
            {grouped.map(([month, list]) => {
              const pnl = list.reduce((s, r) => s + r.pnl, 0);
              return (
                <section key={month}>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="font-display text-2xl tracking-tight">{monthLabel(month, true)}</h2>
                    <span className="text-xs text-muted">
                      {list.length} entr{list.length === 1 ? "y" : "ies"} ·{" "}
                      <span className={pnl >= 0 ? "text-profit" : "text-loss"}>{formatSignedCurrency(pnl)}</span>
                    </span>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {list.map((r, i) => (
                      <JournalEntryCard key={r.entry.id} row={r} index={i} accountName={accountName(r.entry.accountId)} onOpen={() => setDrawerId(r.entry.id)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : (
        <JournalCalendar rowsByDay={rowsByDay} dayPnl={dayPnl} initialMonth={period.anchor} onOpenDay={openDay} />
      )}

      <JournalEntryDrawer
        row={drawerRow}
        accounts={accounts}
        onClose={() => setDrawerId(null)}
        onEdit={() => {
          if (!drawerRow) return;
          setModal({ open: true, entryId: drawerRow.entry.id, day: null });
          setDrawerId(null);
        }}
        onDelete={() => drawerRow && handleDelete(drawerRow.entry.id)}
        onRemoveImage={(attId) => (drawerRow ? removeImage(drawerRow.entry.id, attId) : Promise.resolve())}
        onEditImage={(attId, patch) => (drawerRow ? editImage(drawerRow.entry.id, attId, patch) : Promise.resolve())}
      />

      <JournalEntryModal
        open={modal.open}
        entry={editingEntry}
        defaultDay={modal.day}
        defaultAccountId={accountId || null}
        accounts={accounts}
        trades={trades}
        knownTags={knownTags}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        onSave={saveEntry}
        onDelete={async (id) => {
          await deleteEntry(id);
          setDrawerId(null);
        }}
        onRemoveImage={removeImage}
        onEditImage={editImage}
      />
    </div>
  );
}
