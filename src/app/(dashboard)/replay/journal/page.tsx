"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BookMarked, Download, NotebookPen, Plus, Search, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import MultiSelect from "@/components/ui/MultiSelect";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Field } from "@/components/ui/Modal";
import { TagInput } from "@/components/ui/Inputs";
import { useConfirm } from "@/components/ConfirmContext";
import { useToast } from "@/components/ToastContext";
import ReplayNav, { ReplayFooter } from "@/components/replay/ReplayNav";
import JournalEditor from "@/components/replay/JournalEditor";
import VirtualRows from "@/components/replay/VirtualRows";
import { fmtR, money, tone } from "@/components/replay/format";
import { enrichTrades, sortByExit, type AnalyticsTrade } from "@/lib/replay/analytics";
import { downloadText, tradesToCsv } from "@/lib/replay/session";
import { getSession, newId, saveJournalEntry, saveStrategies } from "@/lib/replay/storage/repo";
import { formatInTz } from "@/lib/replay/time";
import type { JournalEntry, StrategyTemplate } from "@/lib/replay/types";
import { notifyReplayChanged, useSessions, useStrategies } from "@/lib/replay/useReplayData";
import { cn } from "@/lib/utils";

const COLS = "grid grid-cols-[8rem_minmax(8rem,1fr)_4.5rem_4rem_5rem_6rem_minmax(10rem,2fr)_2rem] items-center gap-2 px-3";

function StrategyManager({ strategies }: { strategies: StrategyTemplate[] }) {
  const [editing, setEditing] = useState<StrategyTemplate | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const save = async (next: StrategyTemplate[]) => {
    await saveStrategies(next);
    notifyReplayChanged();
  };
  return (
    <Card>
      <CardHeader
        icon={BookMarked}
        title="Strategy templates"
        subtitle="Reusable names, setups, tags and checklists — offered as suggestions when journaling."
        action={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: newId("st_"), name: "", description: "", setups: [], tags: [], checklist: [] })}>
            <Plus className="h-3.5 w-3.5" /> New template
          </button>
        }
      />
      {strategies.length === 0 ? (
        <p className="text-sm text-muted">No templates yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {strategies.map((s) => (
            <li key={s.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="text-left text-sm font-semibold hover:text-accent" onClick={() => setEditing(s)}>
                  {s.name}
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted hover:bg-loss-soft hover:text-loss"
                  aria-label={`Delete ${s.name}`}
                  onClick={async () => {
                    if (await confirm({ title: "Delete template", message: `Delete “${s.name}”? Journal entries keep their text.`, confirmText: "Delete", destructive: true })) {
                      await save(strategies.filter((x) => x.id !== s.id));
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {s.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{s.description}</p>}
              <p className="mt-1 text-[11px] text-faint">
                {s.setups.length} setups · {s.tags.length} tags · {s.checklist.length} checklist items
              </p>
            </li>
          ))}
        </ul>
      )}
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.name ? `Edit ${editing.name}` : "New strategy template"}
        footer={
          <>
            <button type="button" className="btn btn-secondary ml-auto" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!editing?.name.trim()}
              onClick={async () => {
                if (!editing) return;
                const exists = strategies.some((s) => s.id === editing.id);
                await save(exists ? strategies.map((s) => (s.id === editing.id ? editing : s)) : [...strategies, editing]);
                setEditing(null);
                toast.success("Template saved");
              }}
            >
              Save template
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Name">
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea className="input min-h-[80px]" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <Field label="Setups">
              <TagInput value={editing.setups} onChange={(setups) => setEditing({ ...editing, setups })} placeholder="e.g. Breakout retest — Enter" />
            </Field>
            <Field label="Default tags">
              <TagInput value={editing.tags} onChange={(tags) => setEditing({ ...editing, tags })} />
            </Field>
            <Field label="Checklist (one per line)">
              <textarea
                className="input min-h-[100px]"
                value={editing.checklist.join("\n")}
                onChange={(e) => setEditing({ ...editing, checklist: e.target.value.split("\n").map((l) => l.trimStart()).filter((l, i, arr) => l || i < arr.length - 1) })}
              />
            </Field>
          </div>
        )}
      </Drawer>
    </Card>
  );
}

export default function ReplayJournalPage() {
  return (
    <Suspense fallback={null}>
      <JournalPage />
    </Suspense>
  );
}

function JournalPage() {
  const params = useSearchParams();
  const { sessions } = useSessions("analytics");
  const { strategies } = useStrategies();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [sessionIds, setSessionIds] = useState<string[]>(() => (params.get("session") ? [params.get("session")!] : []));
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<"all" | "win" | "loss" | "noted">("all");
  const [edit, setEdit] = useState<{ trade: AnalyticsTrade; draft: JournalEntry } | null>(null);

  const all = useMemo(
    () => sortByExit(sessions.flatMap((s) => enrichTrades(s.ledger, s.journal, s.strategy, s.name))).reverse(),
    [sessions],
  );
  const journalOf = (t: AnalyticsTrade) => sessions.find((s) => s.id === t.sessionId)?.journal[t.id];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((t) => {
      if (sessionIds.length && !sessionIds.includes(t.sessionId)) return false;
      if (tagFilter.length && !tagFilter.some((x) => t.tags.includes(x))) return false;
      if (outcome === "win" && !(t.netPnl > 0)) return false;
      if (outcome === "loss" && !(t.netPnl < 0)) return false;
      const j = sessions.find((s) => s.id === t.sessionId)?.journal[t.id];
      if (outcome === "noted" && !j) return false;
      if (!q) return true;
      const hay = [t.symbol, t.strategy, t.setup, t.sessionName, t.tags.join(" "), j?.notes, j?.preTrade, j?.postTrade, j?.lessons, j?.entryRationale, j?.exitRationale, j?.context, j?.emotion, (j?.mistakes ?? []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [all, query, sessionIds, tagFilter, outcome, sessions]);

  const tagOpts = Array.from(new Set(all.flatMap((t) => t.tags))).sort().map((v) => ({ value: v, label: `#${v}` }));

  const exportRows = () =>
    filtered.map((t) => ({ trade: t, journal: journalOf(t), sessionName: t.sessionName, strategy: t.strategy }));

  /** Lists carry no screenshots — open the editor with the full stored entry. */
  const openEditor = async (trade: AnalyticsTrade) => {
    try {
      const s = await getSession(trade.sessionId);
      if (!s) throw new Error("Session no longer exists.");
      setEdit({ trade, draft: { ...(s.journal[trade.id] ?? {}) } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const saveEntry = async () => {
    if (!edit) return;
    try {
      await saveJournalEntry(edit.trade.sessionId, edit.trade.id, edit.draft);
      notifyReplayChanged();
      setEdit(null);
      toast.success("Journal saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <NotebookPen className="h-3 w-3" /> Replay · journal
          </>
        }
        title="Replay journal"
        subtitle="Every replayed trade with its notes, tags and review. Search, filter and export."
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!filtered.length}
              onClick={() => downloadText(`replay-trades-${new Date().toISOString().slice(0, 10)}.csv`, tradesToCsv(exportRows()), "text/csv")}
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!filtered.length}
              onClick={() => downloadText(`replay-trades-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportRows(), null, 2), "application/json")}
            >
              <Download className="h-4 w-4" /> JSON
            </button>
          </>
        }
      />
      <ReplayNav />

      <div className="space-y-5">
        <Card padding="sm">
          <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input className="input pl-9" placeholder="Search notes, setups, tags, mistakes…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search journal" />
            </div>
            <MultiSelect value={sessionIds} onChange={setSessionIds} options={sessions.map((s) => ({ value: s.id, label: s.name }))} placeholder="All sessions" />
            <MultiSelect value={tagFilter} onChange={setTagFilter} options={tagOpts} placeholder="Any tag" />
            <SegmentedControl
              value={outcome}
              onChange={setOutcome}
              options={[
                { value: "all", label: "All" },
                { value: "win", label: "Wins" },
                { value: "loss", label: "Losses" },
                { value: "noted", label: "Journaled" },
              ]}
            />
          </div>
        </Card>

        <Card padding="none">
          {all.length === 0 ? (
            <EmptyState icon={NotebookPen} title="No replayed trades yet" description="Closed trades from your sessions appear here for review." action={<Link href="/replay" className="btn btn-primary">Go to sessions</Link>} />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <VirtualRows
                  items={filtered}
                  rowHeight={40}
                  height={Math.min(560, 44 + Math.max(1, filtered.length) * 40)}
                  header={
                    <div className={cn(COLS, "sticky top-0 z-10 border-b border-border bg-surface-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted")}>
                      <span>Exit</span>
                      <span>Session · strategy</span>
                      <span>Side</span>
                      <span>Symbol</span>
                      <span className="text-right">R</span>
                      <span className="text-right">Net</span>
                      <span>Notes</span>
                      <span />
                    </div>
                  }
                  empty={<p className="px-4 py-8 text-center text-sm text-muted">No trades match.</p>}
                  renderRow={(t) => {
                    const j = journalOf(t);
                    const ccy = sessions.find((s) => s.id === t.sessionId)?.settings.accountCurrency ?? "USD";
                    return (
                      <div className={cn(COLS, "h-full border-b border-border/60 text-xs")}>
                        <span className="tabular-nums text-muted">{formatInTz(t.exitT, "UTC", "short")}</span>
                        <span className="truncate">
                          {t.sessionName} <span className="text-faint">· {t.strategy}</span>
                        </span>
                        <span className={t.side === "buy" ? "text-profit" : "text-loss"}>{t.side === "buy" ? "▲ Long" : "▼ Short"}</span>
                        <span>{t.symbol}</span>
                        <span className={cn("text-right tabular-nums", tone(t.rMultiple))}>{fmtR(t.rMultiple)}</span>
                        <span className={cn("text-right font-semibold tabular-nums", tone(t.netPnl))}>{money(t.netPnl, ccy, { signed: true })}</span>
                        <span className="truncate text-muted">
                          {t.tags.length > 0 && <span className="mr-1 text-faint">{t.tags.map((x) => `#${x}`).join(" ")}</span>}
                          {j?.notes || j?.preTrade || j?.lessons || <span className="text-faint">—</span>}
                        </span>
                        <button type="button" className={cn("rounded p-1 hover:bg-surface-2", j ? "text-accent" : "text-faint")} onClick={() => void openEditor(t)} aria-label="Edit journal entry">
                          <NotebookPen className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  }}
                />
              </div>
            </div>
          )}
        </Card>

        <StrategyManager strategies={strategies} />
      </div>

      <ReplayFooter />

      <Drawer
        open={edit !== null}
        onClose={() => setEdit(null)}
        title="Journal entry"
        subtitle={edit ? `${edit.trade.symbol} ${edit.trade.side === "buy" ? "long" : "short"} · ${edit.trade.sessionName} · ${fmtR(edit.trade.rMultiple)}` : undefined}
        width="max-w-2xl"
        footer={
          <>
            <button type="button" className="btn btn-secondary ml-auto" onClick={() => setEdit(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void saveEntry()}>
              Save
            </button>
          </>
        }
      >
        {edit && (
          <JournalEditor
            value={edit.draft}
            onChange={(draft) => setEdit({ ...edit, draft })}
            strategies={strategies}
            defaultStrategy={sessions.find((s) => s.id === edit.trade.sessionId)?.strategy}
          />
        )}
      </Drawer>
    </div>
  );
}
