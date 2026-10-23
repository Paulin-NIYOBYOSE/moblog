"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Database, FilePlus2, FileUp, Pencil, Play, Search, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ConfirmContext";
import { useToast } from "@/components/ToastContext";
import ReplayNav, { ReplayFooter } from "@/components/replay/ReplayNav";
import ImportWizard, { QualitySummary } from "@/components/replay/ImportWizard";
import DataSourceGuide from "@/components/replay/DataSourceGuide";
import { StorageMeter } from "@/components/replay/BackupCard";
import { PRESET_LABEL } from "@/lib/replay/csv";
import { deleteDataset, renameDataset } from "@/lib/replay/storage/repo";
import { formatInTz, SOURCE_TIMEZONES, TIMEFRAMES } from "@/lib/replay/time";
import type { DatasetMeta } from "@/lib/replay/types";
import { notifyReplayChanged, useDatasets, useSessions } from "@/lib/replay/useReplayData";
import { cn } from "@/lib/utils";

function qualityIssues(ds: DatasetMeta): number {
  const q = ds.quality;
  return q.malformed + q.invalidOhlc + q.conflictingDuplicates + q.misaligned + (q.largeGaps.length ? 1 : 0);
}

/** Month-by-month coverage strip — a bar per month, tinted by candle count. */
function CoverageStrip({ ds }: { ds: DatasetMeta }) {
  const max = Math.max(...ds.months.map((m) => m.n), 1);
  return (
    <div className="flex h-5 items-end gap-px" aria-label={`Coverage: ${ds.months.length} months`}>
      {ds.months.map((m) => (
        <span
          key={m.month}
          title={`${m.month}: ${m.n.toLocaleString()} candles`}
          className="min-w-[3px] flex-1 rounded-sm bg-accent"
          style={{ height: `${Math.max(15, (m.n / max) * 100)}%`, opacity: 0.35 + 0.65 * (m.n / max) }}
        />
      ))}
    </div>
  );
}

export default function DatasetsPage() {
  const { datasets, loading } = useDatasets();
  const { sessions } = useSessions();
  const [query, setQuery] = useState("");
  const [tf, setTf] = useState<string>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [appendTo, setAppendTo] = useState<DatasetMeta | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const filtered = useMemo(
    () =>
      datasets.filter((d) => {
        if (tf !== "all" && d.timeframe !== tf) return false;
        const q = query.trim().toUpperCase();
        return !q || d.symbol.includes(q) || d.name.toUpperCase().includes(q);
      }),
    [datasets, query, tf],
  );

  const remove = async (ds: DatasetMeta) => {
    const using = sessions.filter((s) => s.datasetId === ds.id);
    const ok = await confirm({
      title: "Delete dataset",
      message: using.length
        ? `“${ds.name}” is used by ${using.length} session(s). Their saved results stay visible in analytics, but they can’t be reopened until the data is re-imported. Delete ${ds.count.toLocaleString()} candles?`
        : `Delete “${ds.name}” and its ${ds.count.toLocaleString()} candles from the database?`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDataset(ds.id);
      notifyReplayChanged();
      toast.success("Dataset deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <Database className="h-3 w-3" /> Replay · data library
          </>
        }
        title="Datasets"
        subtitle="Historical candles stored in your database — downloaded automatically (FXCM, with Exness filling FXCM's gaps) or imported from files. Each session pins its dataset version so results stay reproducible."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" /> Import data
          </button>
        }
      />
      <ReplayNav />

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input className="input pl-9" placeholder="Search symbol or name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search datasets" />
          </div>
          <select className="input !w-auto" value={tf} onChange={(e) => setTf(e.target.value)} aria-label="Filter by timeframe">
            <option value="all">All timeframes</option>
            {TIMEFRAMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <StorageMeter />
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : datasets.length === 0 ? (
        <div className="space-y-5">
          <Card>
            <EmptyState
              icon={Database}
              title="No data imported yet"
              description="Import a CSV or ZIP from HistData, Dukascopy, MetaTrader or any OHLC file."
              action={
                <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>
                  <FileUp className="h-4 w-4" /> Import data
                </button>
              }
            />
          </Card>
          <DataSourceGuide />
        </div>
      ) : (
        <div className="space-y-3" data-testid="dataset-list">
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted">No datasets match.</p>}
          {filtered.map((ds) => {
            const using = sessions.filter((s) => s.datasetId === ds.id);
            const issues = qualityIssues(ds);
            return (
              <Card key={ds.id} padding="md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {renaming?.id === ds.id ? (
                        <input
                          autoFocus
                          className="input !w-56 !py-1"
                          value={renaming.name}
                          onChange={(e) => setRenaming({ id: ds.id, name: e.target.value })}
                          onBlur={async () => {
                            if (renaming.name.trim()) await renameDataset(ds.id, renaming.name.trim());
                            setRenaming(null);
                            notifyReplayChanged();
                          }}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          aria-label="Dataset name"
                        />
                      ) : (
                        <h3 className="text-[0.95rem] font-semibold">{ds.name}</h3>
                      )}
                      <Badge tone="accent">{ds.symbol}</Badge>
                      <Badge>{ds.timeframe}</Badge>
                      <Badge tone={ds.priceBasis === "unknown" ? "warning" : "muted"}>{ds.priceBasis === "unknown" ? "basis unknown" : `${ds.priceBasis} prices`}</Badge>
                      {ds.hasSpread && <Badge tone="info">recorded spread</Badge>}
                      {ds.derivedFromTicks && <Badge tone="info">from ticks</Badge>}
                      {ds.missingCandles && (
                        <Badge tone="warning" icon={AlertTriangle}>
                          candles missing — re-import
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {formatInTz(ds.firstT, "UTC", "datetime")} → {formatInTz(ds.lastT, "UTC", "datetime")} UTC · {ds.count.toLocaleString()} candles · v{ds.version}
                    </p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      {PRESET_LABEL[ds.source]} · source time {SOURCE_TIMEZONES.find((z) => z.value === ds.sourceTimezone)?.label ?? ds.sourceTimezone} · {ds.files.length} file(s)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Link href={`/replay/new?dataset=${ds.id}`} className={cn("btn btn-primary btn-sm", ds.missingCandles && "pointer-events-none opacity-50")} aria-disabled={ds.missingCandles}>
                      <Play className="h-3.5 w-3.5" /> New session
                    </Link>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setAppendTo(ds);
                        setImportOpen(true);
                      }}
                    >
                      <FilePlus2 className="h-3.5 w-3.5" /> Add data
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming({ id: ds.id, name: ds.name })} aria-label="Rename dataset">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove(ds)} aria-label="Delete dataset">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <CoverageStrip ds={ds} />
                  <div className="mt-1 flex justify-between text-[10px] text-faint">
                    <span>{ds.months[0]?.month}</span>
                    <span>{ds.months[ds.months.length - 1]?.month}</span>
                  </div>
                </div>
                <details className="mt-3 rounded-xl border border-border px-3 py-2">
                  <summary className={cn("cursor-pointer text-xs font-medium", issues ? "text-warning" : "text-muted")}>
                    {issues ? `Data quality: ${issues} item(s) to review` : "Data quality: no issues found"}
                    {ds.quality.gapCount ? ` · ${ds.quality.gapCount.toLocaleString()} missing intervals` : ""}
                  </summary>
                  <div className="mt-3">
                    <QualitySummary q={ds.quality} />
                    <ul className="mt-3 space-y-0.5 text-[11px] text-muted">
                      {ds.files.map((f) => (
                        <li key={`${f.name}-${f.importedAt}`}>
                          {f.name} · {(f.size / 1_048_576).toFixed(1)} MB · {f.rows.toLocaleString()} rows · imported {new Date(f.importedAt).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
                {using.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted">Used by:</span>
                    {using.map((s) => (
                      <Link key={s.id} href={`/replay/session/${s.id}`} className="chip !py-0.5">
                        {s.name}
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
          <DataSourceGuide compact />
        </div>
      )}

      <ReplayFooter />

      <ImportWizard
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setAppendTo(null);
        }}
        datasets={datasets}
        appendTo={appendTo}
      />
    </div>
  );
}
