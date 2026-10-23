"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CandlestickChart,
  Copy,
  Database,
  FileUp,
  History,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import Badge from "@/components/ui/Badge";
import Modal, { Field } from "@/components/ui/Modal";
import SegmentedControl from "@/components/ui/SegmentedControl";
import ThemeToggle from "@/components/ThemeToggle";
import { useConfirm } from "@/components/ConfirmContext";
import { useToast } from "@/components/ToastContext";
import ReplayNav, { ReplayFooter } from "@/components/replay/ReplayNav";
import BackupCard, { StorageMeter } from "@/components/replay/BackupCard";
import Popover from "@/components/replay/Popover";
import { fmtPct, fmtR, money, tone } from "@/components/replay/format";
import { AUTO_FIRST_YEAR, AUTO_INSTRUMENTS, coverageLabel } from "@/lib/replay/providers";
import { duplicateSession, sessionProgress } from "@/lib/replay/session";
import { deleteSession, getSession, patchSession, saveSession } from "@/lib/replay/storage/repo";
import { formatInTz } from "@/lib/replay/time";
import type { DatasetMeta, ReplaySession } from "@/lib/replay/types";
import { notifyReplayChanged, useDatasets, useSessions } from "@/lib/replay/useReplayData";
import { cn } from "@/lib/utils";

type SortKey = "activity" | "created" | "name" | "pnl" | "winrate" | "progress";
type StatusFilter = "all" | "active" | "completed";
type View = "grid" | "table";

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function readPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    // preferences are optional
  }
}

type Readiness = { tone: "profit" | "warning" | "loss" | "info"; label: string; hint: string };

function readiness(s: ReplaySession, datasets: DatasetMeta[]): Readiness {
  const ds = datasets.find((d) => d.id === s.datasetId);
  const provider = s.source?.kind === "provider";
  if (!ds && !provider) return { tone: "loss", label: "Data missing", hint: "The imported dataset was deleted — re-import it to reopen the chart." };
  if (provider && (!ds || !s.dataCheck)) return { tone: "info", label: "Download pending", hint: "History is downloaded the first time you open the chart." };
  if (ds?.missingCandles) return { tone: "warning", label: "Candles missing", hint: "Restored from a backup without candles — re-import the file." };
  if (s.dataCheck?.missingWeeks.length) return { tone: "warning", label: "Data ready · gaps", hint: `No provider has ${s.dataCheck.missingWeeks.length} week(s) of this period.` };
  return { tone: "profit", label: "Data ready", hint: provider ? `Downloaded from ${coverageLabel(ds?.provider, false)}` : "Imported data" };
}

export default function ReplayHubPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { sessions, loading, error } = useSessions();
  const { datasets } = useDatasets();
  const [query, setQuery] = useState("");
  const [symbol, setSymbol] = useState("all");
  const [strategy, setStrategy] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [activity, setActivity] = useState<"any" | "7" | "30">("any");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortKey>(() => readPref<SortKey>("replay.sort", "activity", ["activity", "created", "name", "pnl", "winrate", "progress"]));
  const [view, setView] = useState<View>(() => readPref<View>("replay.view", "grid", ["grid", "table"]));
  const [renaming, setRenaming] = useState<ReplaySession | null>(null);
  // "Now" for the activity filter, fixed per page view (keeps render pure).
  const [now] = useState(() => Date.now());

  const live = sessions.filter((s) => !s.archived);
  const symbols = Array.from(new Set(sessions.map((s) => s.symbol))).sort();
  const strategies = Array.from(new Set(sessions.map((s) => s.strategy).filter(Boolean))).sort();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff = activity === "any" ? 0 : now - Number(activity) * 86_400_000;
    const list = sessions.filter((s) => {
      if (!showArchived && s.archived) return false;
      if (favoritesOnly && !s.favorite) return false;
      if (symbol !== "all" && s.symbol !== symbol) return false;
      if (strategy !== "all" && s.strategy !== strategy) return false;
      if (status !== "all" && s.status !== status) return false;
      if (s.updatedAt < cutoff) return false;
      if (q && ![s.name, s.symbol, s.strategy, ...(s.tags ?? []), s.description ?? ""].some((x) => x.toLowerCase().includes(q))) return false;
      return true;
    });
    const by: Record<SortKey, (a: ReplaySession, b: ReplaySession) => number> = {
      activity: (a, b) => b.updatedAt - a.updatedAt,
      created: (a, b) => b.createdAt - a.createdAt,
      name: (a, b) => a.name.localeCompare(b.name),
      pnl: (a, b) => b.summary.netPnl - a.summary.netPnl,
      winrate: (a, b) => (b.summary.winRate ?? -1) - (a.summary.winRate ?? -1),
      progress: (a, b) => sessionProgress(b) - sessionProgress(a),
    };
    return list.sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || by[sort](a, b));
  }, [sessions, query, symbol, strategy, status, activity, favoritesOnly, showArchived, sort, now]);

  // Aggregates over non-archived sessions; money is never summed across currencies.
  const agg = useMemo(() => {
    const byCcy = new Map<string, { pnl: number; sessions: number }>();
    let trades = 0;
    let totalR = 0;
    let rTrades = 0;
    for (const s of live) {
      trades += s.summary.closedTrades;
      totalR += s.summary.totalR;
      rTrades += s.summary.rTrades ?? s.summary.closedTrades;
      const c = byCcy.get(s.settings.accountCurrency) ?? { pnl: 0, sessions: 0 };
      c.pnl += s.summary.netPnl;
      c.sessions++;
      byCcy.set(s.settings.accountCurrency, c);
    }
    return { trades, avgR: rTrades ? totalR / rTrades : null, rTrades, byCcy: Array.from(byCcy.entries()), active: live.filter((s) => s.status !== "completed").length };
  }, [live]);

  const resume = live.filter((s) => s.status !== "completed").sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      notifyReplayChanged();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const duplicate = (s: ReplaySession, keepProgress: boolean) =>
    act(async () => {
      const full = await getSession(s.id);
      if (!full) throw new Error("Session not found.");
      const copy = duplicateSession(full, { keepProgress, name: `${s.name} (${keepProgress ? "copy" : "fresh"})` });
      await saveSession({ ...copy, revision: undefined });
    }, "Session duplicated");

  const remove = async (s: ReplaySession) => {
    const ok = await confirm({
      title: "Delete session",
      message: `Delete “${s.name}” with its ${s.summary.closedTrades} trades and journal entries? Candle data is kept. This cannot be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) await act(() => deleteSession(s.id), "Session deleted");
  };

  const menu = (s: ReplaySession) => (
    <Popover
      align="right"
      className="w-56 !p-1"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label={`Actions for ${s.name}`} data-testid="session-menu">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col text-sm">
          {[
            { icon: Pencil, label: "Rename", run: async () => setRenaming(s) },
            { icon: Copy, label: "Duplicate with trades", run: () => duplicate(s, true) },
            { icon: Copy, label: "Duplicate settings only", run: () => duplicate(s, false) },
            { icon: s.archived ? ArchiveRestore : Archive, label: s.archived ? "Unarchive" : "Archive", run: () => act(() => patchSession(s.id, { archived: !s.archived }), s.archived ? "Session restored" : "Session archived") },
            { icon: Trash2, label: "Delete", run: () => remove(s), danger: true },
          ].map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                close();
                void a.run();
              }}
              className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2", a.danger && "text-loss hover:bg-loss-soft")}
            >
              <a.icon className="h-3.5 w-3.5" /> {a.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );

  const star = (s: ReplaySession) => (
    <button type="button" onClick={() => void act(() => patchSession(s.id, { favorite: !s.favorite }))} aria-label={s.favorite ? `Unfavorite ${s.name}` : `Favorite ${s.name}`} aria-pressed={Boolean(s.favorite)} className="rounded-md p-1 hover:bg-surface-2">
      <Star className={cn("h-4 w-4", s.favorite ? "fill-gold text-gold" : "text-faint")} />
    </button>
  );

  const primary = (s: ReplaySession) => (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => router.push(`/replay/session/${s.id}/chart`)} data-testid="open-session">
      {s.status === "completed" ? <CandlestickChart className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {s.status === "completed" ? "Review results" : "Resume replay"}
    </button>
  );

  const noSessions = !loading && sessions.length === 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-1.5 flex items-center gap-2">
            <History className="h-3 w-3" /> Replay lab · historical market replay
          </div>
          <h1 className="font-display text-[2rem] leading-[1.05] tracking-tight sm:text-[2.4rem]">Replay</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">Pick a market and a period, trade it candle by candle with realistic costs, and measure the results. Historical data is downloaded and stored for you.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input className="input !w-56 pl-9" placeholder="Search sessions, tags…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sessions" data-testid="session-search" />
          </div>
          <StorageMeter compact />
          <ThemeToggle />
          <Link href="/replay/datasets" className="btn btn-secondary" title="Datasets, imports and backups">
            <Database className="h-4 w-4" /> Data
          </Link>
          <Link href="/replay/new" className="btn btn-primary" data-testid="create-session">
            <Plus className="h-4 w-4" /> Create session
          </Link>
        </div>
      </div>
      <ReplayNav />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-28 md:col-span-2 xl:col-span-3" />
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : noSessions ? (
        <div className="space-y-5">
          <Card padding="lg">
            <div className="mx-auto max-w-2xl py-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <CandlestickChart className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">Start your first backtest</h2>
              <p className="mt-1 text-sm text-muted">
                Choose a pair such as EURUSD, a period and a timeframe. Replay downloads the minute data from FXCM&apos;s free archive (with Exness tick history filling any week FXCM lacks) into your database, hides every candle after your start date, and lets you trade forward.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link href="/replay/new" className="btn btn-primary">
                  <Plus className="h-4 w-4" /> Create session
                </Link>
                <Link href="/replay/datasets" className="btn btn-secondary">
                  <FileUp className="h-4 w-4" /> Import your own data
                </Link>
              </div>
              <p className="mt-4 text-[11px] text-faint">Free, no API key. Coverage: {AUTO_INSTRUMENTS.length} FX pairs from {AUTO_FIRST_YEAR} to last week. Gold and other markets: import a CSV.</p>
            </div>
          </Card>
          <BackupCard />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="hub-summary">
            <Card padding="sm">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Sessions in progress</div>
              <div className="mt-1 text-2xl font-semibold">{agg.active}</div>
              <div className="text-[11px] text-muted">
                of {live.length} non-archived · {sessions.length - live.length} archived
              </div>
            </Card>
            <Card padding="sm">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Closed trades</div>
              <div className="mt-1 text-2xl font-semibold">{agg.trades.toLocaleString()}</div>
              <div className="text-[11px] text-muted">All non-archived sessions combined</div>
            </Card>
            <Card padding="sm">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Combined net P&amp;L</div>
              {agg.byCcy.length ? (
                agg.byCcy.map(([c, v]) => (
                  <div key={c} className={cn("mt-1 text-2xl font-semibold", tone(v.pnl))}>
                    {money(v.pnl, c, { signed: true })}
                    <span className="ml-1.5 text-[11px] font-normal text-muted">
                      {c} · {v.sessions} session{v.sessions === 1 ? "" : "s"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="mt-1 text-2xl font-semibold">—</div>
              )}
              <div className="text-[11px] text-muted">Separate sessions&apos; accounts added together — not one account</div>
            </Card>
            <Card padding="sm">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Average R per trade</div>
              <div className={cn("mt-1 text-2xl font-semibold", tone(agg.avgR))}>{agg.avgR === null ? "—" : fmtR(agg.avgR)}</div>
              <div className="text-[11px] text-muted">{agg.rTrades ? `${agg.rTrades.toLocaleString()} trade${agg.rTrades === 1 ? "" : "s"} with a stop, all sessions` : "No trades with a stop yet"}</div>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_18rem]">
            <div className="min-w-0 space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select className="input !w-auto !py-1.5 text-sm" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Filter by instrument">
                  <option value="all">All instruments</option>
                  {symbols.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select className="input !w-auto !py-1.5 text-sm" value={strategy} onChange={(e) => setStrategy(e.target.value)} aria-label="Filter by strategy">
                  <option value="all">All strategies</option>
                  {strategies.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <SegmentedControl
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "all", label: "All" },
                    { value: "active", label: "In progress" },
                    { value: "completed", label: "Completed" },
                  ]}
                />
                <select className="input !w-auto !py-1.5 text-sm" value={activity} onChange={(e) => setActivity(e.target.value as typeof activity)} aria-label="Filter by recent activity">
                  <option value="any">Any activity</option>
                  <option value="7">Active in last 7 days</option>
                  <option value="30">Active in last 30 days</option>
                </select>
                <button type="button" className="chip" data-active={favoritesOnly} onClick={() => setFavoritesOnly((v) => !v)}>
                  <Star className="h-3 w-3" /> Favorites
                </button>
                <button type="button" className="chip" data-active={showArchived} onClick={() => setShowArchived((v) => !v)}>
                  <Archive className="h-3 w-3" /> Archived
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <select
                    className="input !w-auto !py-1.5 text-sm"
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as SortKey);
                      writePref("replay.sort", e.target.value);
                    }}
                    aria-label="Sort sessions"
                  >
                    <option value="activity">Last activity</option>
                    <option value="created">Newest</option>
                    <option value="name">Name</option>
                    <option value="pnl">Net P&amp;L</option>
                    <option value="winrate">Win rate</option>
                    <option value="progress">Progress</option>
                  </select>
                  <SegmentedControl
                    value={view}
                    onChange={(v) => {
                      setView(v);
                      writePref("replay.view", v);
                    }}
                    showLabels={false}
                    options={[
                      { value: "grid", label: "Grid", icon: LayoutGrid },
                      { value: "table", label: "Table", icon: List },
                    ]}
                  />
                </div>
              </div>

              {!filtered.length ? (
                <Card>
                  <p className="py-8 text-center text-sm text-muted">No sessions match these filters.</p>
                </Card>
              ) : view === "grid" ? (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" data-testid="session-list">
                  {filtered.map((s) => {
                    const p = sessionProgress(s);
                    const r = readiness(s, datasets);
                    const ccy = s.settings.accountCurrency;
                    const trades = s.summary.closedTrades;
                    const avgR = trades ? s.summary.totalR / Math.max(1, s.summary.rTrades ?? trades) : null;
                    return (
                      <Card key={s.id} interactive className={cn("flex flex-col", s.archived && "opacity-70")} padding="md">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link href={`/replay/session/${s.id}`} className="block truncate text-[0.95rem] font-semibold hover:text-accent" data-testid="session-card-title">
                              {s.name}
                            </Link>
                            <p className="mt-0.5 truncate text-xs text-muted">
                              {s.symbol} · {s.timeframe} · {formatInTz(s.startT, s.displayTimezone, "month")} → {formatInTz(s.endT, s.displayTimezone, "month")}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center">
                            {star(s)}
                            {menu(s)}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {s.status === "completed" ? <Badge tone="profit">Completed</Badge> : <Badge tone="accent">In progress</Badge>}
                          <span title={r.hint}>
                            <Badge tone={r.tone}>{r.label}</Badge>
                          </span>
                          {s.strategy && <Badge>{s.strategy}</Badge>}
                          {(s.tags ?? []).slice(0, 3).map((t) => (
                            <Badge key={t} tone="muted">
                              #{t}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Net P&amp;L</div>
                            <div className={cn("text-sm font-semibold tabular-nums", tone(s.summary.netPnl))}>{trades ? money(s.summary.netPnl, ccy, { signed: true }) : "—"}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Trades</div>
                            <div className="text-sm font-semibold tabular-nums">
                              {trades}
                              {s.summary.openPositions ? <span className="text-xs font-normal text-muted"> +{s.summary.openPositions} open</span> : null}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Win · avg R</div>
                            <div className="text-sm font-semibold tabular-nums">{trades ? <>{fmtPct(s.summary.winRate, 0)} · <span className={tone(avgR)}>{fmtR(avgR, 2)}</span></> : "—"}</div>
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Replay progress">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${p * 100}%` }} />
                          </div>
                          <div className="mt-1 flex justify-between text-[10.5px] text-muted">
                            <span>{Math.round(p * 100)}% replayed</span>
                            <span>Active {ago(s.updatedAt)}</span>
                          </div>
                        </div>
                        <div className="mt-auto flex items-center justify-end gap-2 pt-4">
                          <Link href={`/replay/session/${s.id}`} className="btn btn-ghost btn-sm">
                            Details
                          </Link>
                          {primary(s)}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card padding="none">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-xs" data-testid="session-table">
                      <thead className="text-[10px] uppercase tracking-wider text-muted">
                        <tr className="border-b border-border bg-surface-2">
                          <th className="w-8 px-2" />
                          <th className="py-2 text-left font-semibold">Session</th>
                          <th className="text-left font-semibold">Market</th>
                          <th className="text-left font-semibold">Period</th>
                          <th className="text-right font-semibold">Progress</th>
                          <th className="text-right font-semibold">Trades</th>
                          <th className="text-right font-semibold">Net</th>
                          <th className="text-right font-semibold">Win</th>
                          <th className="text-right font-semibold">Avg R</th>
                          <th className="text-left font-semibold">Data</th>
                          <th className="text-right font-semibold">Activity</th>
                          <th className="px-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((s) => {
                          const trades = s.summary.closedTrades;
                          const r = readiness(s, datasets);
                          const avgR = trades ? s.summary.totalR / Math.max(1, s.summary.rTrades ?? trades) : null;
                          return (
                            <tr key={s.id} className={cn("border-b border-border/60 hover:bg-surface-2", s.archived && "opacity-70")}>
                              <td className="px-1">{star(s)}</td>
                              <td className="max-w-[16rem] py-1.5">
                                <Link href={`/replay/session/${s.id}`} className="block truncate font-medium hover:text-accent">
                                  {s.name}
                                </Link>
                                <span className="text-[10.5px] text-muted">{s.strategy || "No strategy"}</span>
                              </td>
                              <td>
                                {s.symbol} · {s.timeframe}
                              </td>
                              <td className="tabular-nums text-muted">
                                {formatInTz(s.startT, s.displayTimezone, "month")} → {formatInTz(s.endT, s.displayTimezone, "month")}
                              </td>
                              <td className="text-right tabular-nums">{Math.round(sessionProgress(s) * 100)}%</td>
                              <td className="text-right tabular-nums">{trades}</td>
                              <td className={cn("text-right font-semibold tabular-nums", tone(s.summary.netPnl))}>{trades ? money(s.summary.netPnl, s.settings.accountCurrency, { signed: true }) : "—"}</td>
                              <td className="text-right tabular-nums">{trades ? fmtPct(s.summary.winRate, 0) : "—"}</td>
                              <td className={cn("text-right tabular-nums", tone(avgR))}>{trades ? fmtR(avgR) : "—"}</td>
                              <td title={r.hint}>
                                <Badge tone={r.tone}>{r.label}</Badge>
                              </td>
                              <td className="text-right text-muted">{ago(s.updatedAt)}</td>
                              <td className="px-3">
                                <div className="flex items-center justify-end gap-1">
                                  {primary(s)}
                                  {menu(s)}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>

            {/* What next */}
            <div className="space-y-4">
              {resume && (
                <Card padding="sm">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Continue where you left off</div>
                  <p className="mt-1 truncate text-sm font-semibold">{resume.name}</p>
                  <p className="text-[11px] text-muted">
                    At {formatInTz(resume.cursorT, resume.displayTimezone, "datetime")} · {Math.round(sessionProgress(resume) * 100)}% replayed
                  </p>
                  <Link href={`/replay/session/${resume.id}/chart`} className="btn btn-primary btn-sm mt-3 w-full">
                    <Play className="h-3.5 w-3.5" /> Resume replay
                  </Link>
                </Card>
              )}
              <Card padding="sm">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Recent activity</div>
                <ul className="mt-2 space-y-2">
                  {[...sessions]
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .slice(0, 6)
                    .map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                        <Link href={`/replay/session/${s.id}`} className="min-w-0 truncate hover:text-accent">
                          {s.name}
                        </Link>
                        <span className="shrink-0 text-muted">{ago(s.updatedAt)}</span>
                      </li>
                    ))}
                </ul>
              </Card>
            </div>
          </div>
          <BackupCard />
        </div>
      )}

      <ReplayFooter />
      {renaming && <RenameModal session={renaming} onClose={() => setRenaming(null)} onSave={(name) => act(() => patchSession(renaming.id, { name }), "Session renamed").then(() => setRenaming(null))} />}
    </div>
  );
}

function RenameModal({ session, onClose, onSave }: { session: ReplaySession; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(session.name);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Rename session"
      icon={Pencil}
      footer={
        <>
          <button type="button" className="btn btn-secondary ml-auto" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={() => onSave(name.trim())} data-testid="rename-save">
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name.trim())}
          data-testid="rename-input"
        />
      </Field>
    </Modal>
  );
}
