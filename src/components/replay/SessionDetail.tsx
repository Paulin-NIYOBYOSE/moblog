"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BarChart3,
  CandlestickChart,
  Copy,
  Database,
  Download,
  ListOrdered,
  Loader2,
  NotebookPen,
  Play,
  Settings2,
  Star,
  Trash2,
} from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal, { Field } from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import { TagInput } from "@/components/ui/Inputs";
import { useConfirm } from "@/components/ConfirmContext";
import { useToast } from "@/components/ToastContext";
import { computeMetrics, enrichTrades, METRIC_HELP, type AnalyticsTrade } from "@/lib/replay/analytics";
import { AUTO_TERMS, coverageLabel } from "@/lib/replay/providers";
import { downloadText, duplicateSession, sessionProgress, tradesToCsv } from "@/lib/replay/session";
import { deleteSession, getDataset, getSession, patchSession, saveSession } from "@/lib/replay/storage/repo";
import { formatDuration, formatInTz } from "@/lib/replay/time";
import type { DatasetMeta, ReplaySession } from "@/lib/replay/types";
import { notifyReplayChanged, useStrategies } from "@/lib/replay/useReplayData";
import { cn } from "@/lib/utils";
import { EquityAndDrawdown } from "./analytics/Charts";
import TradeExplorer from "./analytics/TradeExplorer";
import { fmtNum, fmtPct, fmtR, money, tone } from "./format";
import ReplayNav from "./ReplayNav";

function Stat({ label, value, sub, cls, help }: { label: string; value: string; sub?: string; cls?: string; help?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3" title={help}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tracking-tight", cls)}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export default function SessionDetail({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { strategies } = useStrategies();
  const [s, setS] = useState<ReplaySession | null>(null);
  const [ds, setDs] = useState<DatasetMeta | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [explore, setExplore] = useState<AnalyticsTrade | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const full = await getSession(sessionId);
      if (!full) throw new Error("Session not found — it may have been deleted.");
      setS(full);
      setNotes(null);
      setDs((await getDataset(full.datasetId)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const trades = useMemo(() => (s ? enrichTrades(s.ledger, s.journal, s.strategy, s.name) : []), [s]);
  const m = useMemo(() => (s ? computeMetrics(trades, s.settings.initialBalance) : null), [s, trades]);

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-warning" />
        <p className="mt-3 text-sm text-muted">{error}</p>
        <Link href="/replay" className="btn btn-primary mt-4">
          <ArrowLeft className="h-4 w-4" /> Back to sessions
        </Link>
      </div>
    );
  }
  if (!s || !m) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const ccy = s.settings.accountCurrency;
  const progress = sessionProgress(s);
  const completed = s.status === "completed";
  const lowSample = m.total > 0 && m.total < 30;

  const patch = async (p: Parameters<typeof patchSession>[1], ok?: string) => {
    try {
      const next = await patchSession(s.id, p);
      setS({ ...s, ...next, journal: s.journal, commands: s.commands, drawings: s.drawings, ledger: s.ledger });
      notifyReplayChanged();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const duplicate = async (keepProgress: boolean) => {
    setBusy("dup");
    try {
      const copy = duplicateSession(s, { keepProgress, name: `${s.name} (${keepProgress ? "copy" : "fresh"})` });
      await saveSession({ ...copy, revision: undefined });
      notifyReplayChanged();
      toast.success(`Created “${copy.name}”`);
      router.push(`/replay/session/${copy.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete session",
      message: `Delete “${s.name}” with its ${s.ledger.length} trades and journal entries? The candle data is kept. This cannot be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await deleteSession(s.id);
    notifyReplayChanged();
    router.push("/replay");
  };

  const exportResults = (kind: "csv" | "json") => {
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = s.name.replace(/[^\w]+/g, "-").slice(0, 40);
    if (kind === "csv") {
      downloadText(`${slug}-trades-${stamp}.csv`, tradesToCsv(s.ledger.map((t) => ({ trade: t, journal: s.journal[t.id], sessionName: s.name, strategy: s.strategy })), s.displayTimezone), "text/csv");
    } else {
      const journal = Object.fromEntries(Object.entries(s.journal).map(([k, v]) => [k, { ...v, screenshot: v.screenshot ? "(omitted)" : undefined }]));
      downloadText(`${slug}-results-${stamp}.json`, JSON.stringify({ session: { ...s, journal }, metrics: m, dataset: ds }, null, 2), "application/json");
    }
  };

  const recent = [...trades].reverse().slice(0, 10);
  const sourceLabel = s.source?.kind === "provider" || ds?.provider ? `${coverageLabel(ds?.provider, false)} (automatic download)` : ds ? `Imported file${ds.files.length > 1 ? "s" : ""}` : "Dataset deleted";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/replay" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Sessions
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[2rem] leading-[1.05] tracking-tight" data-testid="session-title">
              {s.name}
            </h1>
            <button type="button" onClick={() => void patch({ favorite: !s.favorite })} aria-label={s.favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={Boolean(s.favorite)} className="rounded-md p-1 hover:bg-surface-2">
              <Star className={cn("h-5 w-5", s.favorite ? "fill-gold text-gold" : "text-faint")} />
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <Badge tone="accent">{s.symbol}</Badge>
            <Badge>{s.timeframe}</Badge>
            {completed ? <Badge tone="profit">Completed</Badge> : <Badge tone="info">In progress · {Math.round(progress * 100)}%</Badge>}
            {s.archived && <Badge tone="warning">Archived</Badge>}
            <span className="ml-1">
              {formatInTz(s.startT, s.displayTimezone, "date")} → {formatInTz(s.endT, s.displayTimezone, "date")}
            </span>
            {s.strategy && <span>· {s.strategy}</span>}
            {(s.tags ?? []).map((t) => (
              <span key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px]">
                #{t}
              </span>
            ))}
          </div>
          {s.description && <p className="mt-2 max-w-2xl text-sm text-muted">{s.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/replay/session/${s.id}/chart`} className="btn btn-primary" data-testid="session-primary">
            <Play className="h-4 w-4" /> {completed ? "Review on chart" : s.commandCount || s.commands.length ? "Continue replay" : "Start replay"}
          </Link>
          <Link href={`/replay/journal?session=${s.id}`} className="btn btn-secondary">
            <ListOrdered className="h-4 w-4" /> Review trades
          </Link>
          <Link href={`/replay/analytics?session=${s.id}`} className="btn btn-secondary">
            <BarChart3 className="h-4 w-4" /> Analytics
          </Link>
        </div>
      </div>
      <ReplayNav />

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={`/replay/session/${s.id}/chart`} className="btn btn-ghost btn-sm">
          <CandlestickChart className="h-4 w-4" /> Open chart
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)} data-testid="session-edit">
          <Settings2 className="h-4 w-4" /> Edit details
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void duplicate(true)}>
          {busy === "dup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Duplicate with trades
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void duplicate(false)}>
          <Copy className="h-4 w-4" /> Duplicate settings only
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportResults("csv")} disabled={!s.ledger.length}>
          <Download className="h-4 w-4" /> Export trades (CSV)
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportResults("json")}>
          <Download className="h-4 w-4" /> Export results (JSON)
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void patch({ archived: !s.archived }, s.archived ? "Session restored" : "Session archived")}>
          {s.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {s.archived ? "Unarchive" : "Archive"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm text-loss hover:bg-loss-soft" onClick={() => void remove()}>
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" data-testid="session-stats">
        <Stat label="Starting balance" value={money(s.settings.initialBalance, ccy)} />
        <Stat label="Balance" value={money(s.summary.balance, ccy)} sub={`Equity ${money(s.summary.equity, ccy)}`} help="Balance counts closed trades; equity adds open positions at the last saved replay point." />
        <Stat label="Net P&L" value={money(m.netPnl, ccy, { signed: true })} sub={fmtPct(m.returnPct, 2, true)} cls={tone(m.netPnl)} help={METRIC_HELP.netPnl} />
        <Stat label="Trades" value={String(m.total)} sub={s.summary.openPositions ? `+${s.summary.openPositions} open` : undefined} />
        <Stat label="Win rate" value={m.total ? fmtPct(m.winRate, 0) : "—"} sub={m.total ? `n = ${m.total}${lowSample ? " · small sample" : ""}` : "No closed trades"} help={METRIC_HELP.winRate} />
        <Stat label="Average R" value={fmtR(m.avgR)} sub={m.validR ? `${m.validR} with a stop` : undefined} cls={tone(m.avgR)} help={METRIC_HELP.avgR} />
        <Stat label="Profit factor" value={m.profitFactor !== null ? fmtNum(m.profitFactor) : m.profitFactorNote === "no-losses" ? "No losses" : "—"} help={METRIC_HELP.profitFactor} />
        <Stat label="Max drawdown" value={m.total ? money(m.maxDrawdown, ccy) : "—"} sub={m.total ? fmtPct(m.maxDrawdownPct, 2) : undefined} cls={m.maxDrawdown > 0 ? "text-loss" : undefined} help={METRIC_HELP.maxDrawdown} />
      </div>
      {lowSample && <p className="mt-2 text-[11px] text-muted">Fewer than 30 closed trades — treat these figures as anecdotal, not as evidence of an edge. Past results don&apos;t guarantee future performance.</p>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <EquityAndDrawdown trades={trades} initialBalance={s.settings.initialBalance} ccy={ccy} />
          <Card padding="none">
            <div className="px-4 pt-4 sm:px-5">
              <CardHeader icon={ListOrdered} title="Recent trades" subtitle={s.ledger.length ? `Latest ${recent.length} of ${s.ledger.length} — click one to inspect it on the chart.` : undefined} action={s.ledger.length > 10 ? <Link href={`/replay/journal?session=${s.id}`} className="text-xs text-accent hover:underline">All trades</Link> : undefined} />
            </div>
            {!recent.length ? (
              <p className="px-5 pb-5 text-sm text-muted">No closed trades yet. Open the chart, step through the replay and trade it — results appear here.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted">
                    <tr className="border-y border-border bg-surface-2">
                      <th className="px-4 py-1.5 text-left font-semibold">Exit</th>
                      <th className="text-left font-semibold">Side</th>
                      <th className="text-left font-semibold">Setup</th>
                      <th className="text-right font-semibold">R</th>
                      <th className="text-right font-semibold">Net</th>
                      <th className="px-4 text-right font-semibold">Held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((t) => (
                      <tr key={t.id} className="cursor-pointer border-b border-border/60 hover:bg-surface-2" onClick={() => setExplore(t)} data-testid="detail-trade-row">
                        <td className="px-4 py-1.5 tabular-nums text-muted">{formatInTz(t.exitT, s.displayTimezone, "short")}</td>
                        <td className={t.side === "buy" ? "text-profit" : "text-loss"}>{t.side === "buy" ? "▲ Long" : "▼ Short"}</td>
                        <td className="max-w-[10rem] truncate">{t.setup}</td>
                        <td className={cn("text-right tabular-nums", tone(t.rMultiple))}>{fmtR(t.rMultiple)}</td>
                        <td className={cn("text-right font-semibold tabular-nums", tone(t.netPnl))}>{money(t.netPnl, ccy, { signed: true })}</td>
                        <td className="px-4 text-right tabular-nums text-muted">{formatDuration(t.holdingSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader icon={Database} title="Data" subtitle={sourceLabel} />
            {ds === undefined ? (
              <Skeleton className="h-20" />
            ) : !ds ? (
              <p className="text-sm text-warning">This session&apos;s dataset was deleted. Its saved results stay visible, but the chart can&apos;t open until the data exists again.</p>
            ) : (
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Dataset</dt>
                  <dd className="truncate text-right">{ds.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Prices</dt>
                  <dd>
                    {ds.priceBasis}
                    {ds.hasSpread ? " + recorded spread" : ""} · {ds.timeframe} execution
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">History shown before start</dt>
                  <dd className="tabular-nums">{formatInTz(s.historyStartT, s.displayTimezone, "date")}</dd>
                </div>
                {s.dataCheck ? (
                  <>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Candles in period</dt>
                      <dd className="tabular-nums">{s.dataCheck.bars.toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted" title="Missing candles outside the weekly closure. On 1-minute data most are single minutes without quotes, e.g. around the daily rollover. They are never filled in.">
                        Missing intervals (excl. weekends)
                      </dt>
                      <dd className={cn("tabular-nums", s.dataCheck.gapCount ? "text-warning" : undefined)}>{s.dataCheck.gapCount.toLocaleString()}</dd>
                    </div>
                    {s.dataCheck.missingWeeks.length > 0 && (
                      <p className="rounded-lg bg-warning-soft px-2 py-1.5 text-warning">No provider has week(s) {s.dataCheck.missingWeeks.join(", ")} — shown as gaps, never filled.</p>
                    )}
                    {s.dataCheck.largeGaps.length > 0 && (
                      <details className="text-muted">
                        <summary className="cursor-pointer">Largest gaps</summary>
                        <ul className="mt-1 space-y-0.5 tabular-nums">
                          {s.dataCheck.largeGaps.slice(0, 6).map((g) => (
                            <li key={g.from}>
                              {formatInTz(g.from, "UTC", "short")} · {formatDuration(g.seconds)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <p className="text-[11px] text-faint">Checked {new Date(s.dataCheck.checkedAt).toLocaleString()}</p>
                  </>
                ) : (
                  <p className="text-[11px] text-faint">The data check runs when the session is prepared.</p>
                )}
                {ds.provider && <p className="pt-1 text-[11px] leading-snug text-faint">{AUTO_TERMS}</p>}
              </dl>
            )}
          </Card>

          <Card>
            <CardHeader icon={Settings2} title="Execution" subtitle="Assumptions applied to every fill." />
            <dl className="space-y-1.5 text-xs">
              {(
                [
                  ["Account", `${money(s.settings.initialBalance, ccy)} ${ccy}`],
                  ["Default risk", s.settings.riskMode === "percent" ? `${s.settings.riskPercent}% of equity` : s.settings.riskMode === "money" ? `${money(s.settings.riskMoney, ccy)} per trade` : `${s.settings.fixedLots} lots`],
                  ["Spread", s.settings.spreadMode === "recorded" && ds?.hasSpread ? `recorded (fallback ${s.settings.spreadPips} pips)` : `${s.settings.spreadPips} pips fixed`],
                  ["Slippage", `${s.settings.slippagePips} pips`],
                  ["Commission", `${money(s.settings.commissionPerLot, ccy)} / lot round turn`],
                  ["Same-candle SL & TP", "stop-loss assumed first"],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-faint">Change these from the chart&apos;s session settings — every recorded action is then replayed with the new costs.</p>
          </Card>

          <Card>
            <CardHeader icon={NotebookPen} title="Notes" />
            <textarea
              className="input min-h-[120px] resize-y text-[0.82rem]"
              placeholder="What are you testing? What have you noticed so far?"
              value={notes ?? s.notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== null && notes !== s.notes && void patch({ notes }, "Notes saved")}
              aria-label="Session notes"
              data-testid="session-notes"
            />
          </Card>
        </div>
      </div>

      {editOpen && (
        <EditDetails
          session={s}
          strategies={strategies.map((x) => x.name)}
          onClose={() => setEditOpen(false)}
          onSave={async (p) => {
            await patch(p, "Session updated");
            setEditOpen(false);
          }}
        />
      )}
      <TradeExplorer trade={explore} session={explore ? s : null} journal={explore ? s.journal[explore.id] : undefined} onClose={() => setExplore(null)} />
    </div>
  );
}

function EditDetails({
  session,
  strategies,
  onClose,
  onSave,
}: {
  session: ReplaySession;
  strategies: string[];
  onClose: () => void;
  onSave: (p: { name: string; strategy: string; description: string; tags: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState(session.name);
  const [strategy, setStrategy] = useState(session.strategy);
  const [description, setDescription] = useState(session.description ?? "");
  const [tags, setTags] = useState<string[]>(session.tags ?? []);
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit session details"
      icon={Settings2}
      footer={
        <>
          <button type="button" className="btn btn-secondary ml-auto" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              await onSave({ name, strategy, description, tags });
              setSaving(false);
            }}
            data-testid="session-edit-save"
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="session-edit-name" />
        </Field>
        <Field label="Strategy">
          <input className="input" list="detail-strategies" value={strategy} onChange={(e) => setStrategy(e.target.value)} />
          <datalist id="detail-strategies">
            {strategies.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
        <Field label="Description">
          <textarea className="input min-h-[72px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
        <p className="text-[11px] text-muted">Execution settings (balance, risk, costs) live in the chart&apos;s session settings, because changing them recomputes every trade.</p>
      </div>
    </Modal>
  );
}
