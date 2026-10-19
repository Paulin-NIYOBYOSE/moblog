"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import Modal, { Field } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Inputs";
import { COLUMN_ROLES, ImportAccumulator, PRESET_LABEL, TS_FORMATS, type ColumnRole, type ImportConfig } from "@/lib/replay/csv";
import { ImportClient } from "@/lib/replay/importClient";
import type { FileDetection } from "@/lib/replay/importer";
import type { ParsedSummary } from "@/lib/replay/importProtocol";
import { INSTRUMENTS, normalizeSymbol, resolveInstrument } from "@/lib/replay/instruments";
import { newId, type ImportCommitResult } from "@/lib/replay/storage/repo";
import { formatDuration, formatInTz, SOURCE_TIMEZONES } from "@/lib/replay/time";
import type { DatasetMeta, PriceBasis, QualityReport } from "@/lib/replay/types";
import { notifyReplayChanged } from "@/lib/replay/useReplayData";
import { cn } from "@/lib/utils";

type Phase = "pick" | "detecting" | "map" | "parsing" | "review" | "committing" | "done";

export function QualitySummary({ q, compact = false }: { q: QualityReport; compact?: boolean }) {
  const items: { label: string; value: number; tone: "ok" | "warn" | "bad"; help: string }[] = [
    { label: "Malformed rows", value: q.malformed, tone: q.malformed ? "bad" : "ok", help: "Rows whose timestamp or numbers couldn't be read. Skipped." },
    { label: "Invalid OHLC", value: q.invalidOhlc, tone: q.invalidOhlc ? "bad" : "ok", help: "High below low, open/close outside the range, or non-positive prices. Skipped." },
    { label: "Duplicates", value: q.duplicates, tone: q.conflictingDuplicates ? "warn" : "ok", help: `Rows with an already-seen timestamp. The first was kept${q.conflictingDuplicates ? `; ${q.conflictingDuplicates} had different prices` : ""}.` },
    { label: "Out of order", value: q.outOfOrder, tone: q.outOfOrder ? "warn" : "ok", help: "Rows earlier than the previous one. Sorted chronologically." },
    { label: "Missing intervals", value: q.gapCount, tone: q.gapCount ? "warn" : "ok", help: "Gaps between candles outside the weekly closure. Never filled with invented prices." },
    { label: "Misaligned", value: q.misaligned, tone: q.misaligned ? "warn" : "ok", help: "Candles not starting on a timeframe boundary — usually a wrong source time zone." },
  ];
  return (
    <div className="space-y-2">
      <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
        {items.map((it) => (
          <div key={it.label} className="rounded-lg border border-border px-2.5 py-1.5" title={it.help}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{it.label}</div>
            <div className={cn("text-sm font-semibold tabular-nums", it.tone === "bad" ? "text-loss" : it.tone === "warn" ? "text-warning" : "text-foreground")}>
              {it.value.toLocaleString()}
              {it.tone === "ok" && <span className="ml-1 text-[10px] font-normal text-profit">✓</span>}
            </div>
          </div>
        ))}
      </div>
      {!compact && q.weekendGaps > 0 && <p className="text-[11px] text-muted">{q.weekendGaps} weekly market closures detected (expected, not counted as gaps).</p>}
      {!compact && q.largeGaps.length > 0 && (
        <details className="rounded-lg border border-border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium">Largest gaps ({q.largeGaps.length})</summary>
          <ul className="mt-1.5 space-y-0.5 tabular-nums text-muted">
            {q.largeGaps.slice(0, 12).map((g) => (
              <li key={g.from}>
                {formatInTz(g.from, "UTC", "short")} → {formatInTz(g.to, "UTC", "short")} UTC · {formatDuration(g.seconds)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!compact && (q.malformedExamples.length > 0 || q.invalidExamples.length > 0) && (
        <details className="rounded-lg border border-border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium">Rejected rows (examples)</summary>
          <ul className="mt-1.5 space-y-1 font-mono text-[11px] text-muted">
            {[...q.malformedExamples, ...q.invalidExamples].slice(0, 15).map((ex) => (
              <li key={`${ex.line}-${ex.reason}`}>
                <span className="text-loss">line {ex.line}</span> {ex.reason}: <span className="break-all">{ex.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function ImportWizard({
  open,
  onClose,
  datasets,
  appendTo,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  datasets: DatasetMeta[];
  appendTo?: DatasetMeta | null;
  onImported?: (ds: DatasetMeta) => void;
}) {
  const clientRef = useRef<ImportClient | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [detection, setDetection] = useState<FileDetection | null>(null);
  const [config, setConfig] = useState<ImportConfig | null>(null);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ParsedSummary | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importId, setImportId] = useState<string>("");
  const [target, setTarget] = useState<{ mode: "new" | "append"; datasetId?: string; name: string }>({ mode: "new", name: "" });
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, []);

  const client = () => {
    if (!clientRef.current) clientRef.current = new ImportClient();
    return clientRef.current;
  };

  const reset = () => {
    if (importId) void clientRef.current?.discard(importId);
    setPhase("pick");
    setFile(null);
    setDetection(null);
    setConfig(null);
    setSummary(null);
    setResult(null);
    setError(null);
    setProgress(0);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickFile = async (f: File) => {
    setError(null);
    setFile(f);
    setPhase("detecting");
    try {
      const det = await client().detect(f);
      setDetection(det);
      const cfg = { ...det.config };
      if (appendTo) {
        cfg.symbol = appendTo.symbol;
        setTarget({ mode: "append", datasetId: appendTo.id, name: "" });
      } else {
        setTarget({ mode: "new", name: cfg.symbol ? `${cfg.symbol} ${det.timeframeHint ?? ""}`.trim() : "" });
      }
      setConfig(cfg);
      setPhase("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("pick");
    }
  };

  const spec = config ? resolveInstrument(config.symbol) : null;
  const configErrors = useMemo(() => {
    if (!config) return [];
    const errs = ImportAccumulator.validateConfig(config);
    if (config.symbol && !resolveInstrument(config.symbol)) errs.push(`“${config.symbol}” is not a recognised instrument (use e.g. EURUSD, XAUUSD).`);
    if (target.mode === "append" && !target.datasetId) errs.push("Choose the dataset to append to.");
    return errs;
  }, [config, target]);

  const appendCandidates = datasets.filter((d) => !config?.symbol || d.symbol === normalizeSymbol(config.symbol));

  const parse = async () => {
    if (!config || !file || !detection || !spec) return;
    setError(null);
    setPhase("parsing");
    setProgress(0);
    const id = newId("imp_");
    setImportId(id);
    try {
      const cfg = { ...config, symbol: spec.symbol, pointSize: 10 ** -spec.digits };
      const s = await client().parse(id, file, cfg, detection.entryName, setProgress);
      setSummary(s);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("map");
    }
  };

  const commit = async () => {
    if (!config || !file || !summary || !spec) return;
    setPhase("committing");
    setError(null);
    try {
      const r = await client().commit(importId, {
        symbol: spec.symbol,
        source: config.preset,
        sourceTimezone: config.timezone,
        fileName: detection?.entryName ?? file.name,
        fileSize: file.size,
        target: target.mode === "append" ? { mode: "append", datasetId: target.datasetId } : { mode: "new", name: target.name },
      });
      setResult(r);
      setImportId("");
      setPhase("done");
      notifyReplayChanged();
      onImported?.(r.dataset);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("review");
    }
  };

  const setCol = (i: number, role: ColumnRole) => {
    if (!config) return;
    const columns = config.columns.map((c, k) => (k === i ? role : c === role && role !== "ignore" ? "ignore" : c));
    setConfig({ ...config, columns });
  };

  const tfMismatch = summary && target.mode === "append" && datasets.find((d) => d.id === target.datasetId)?.timeframe !== summary.timeframe;

  return (
    <Modal
      open={open}
      onClose={close}
      title={appendTo ? `Add data to ${appendTo.name}` : "Import historical data"}
      subtitle="CSV or ZIP from HistData, Dukascopy, MetaTrader or any OHLC/tick CSV. Parsed in a background worker, then stored in your database."
      icon={FileUp}
      size="xl"
      footer={
        <>
          {phase === "map" && (
            <>
              <button type="button" className="btn btn-secondary" onClick={reset}>
                Choose another file
              </button>
              <button type="button" className="btn btn-primary ml-auto" disabled={configErrors.length > 0} onClick={() => void parse()} data-testid="import-parse">
                Parse &amp; check data
              </button>
            </>
          )}
          {phase === "review" && summary && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setPhase("map")}>
                Back to mapping
              </button>
              <button type="button" className="btn btn-primary ml-auto" disabled={!summary.timeframe || summary.n === 0 || Boolean(tfMismatch)} onClick={() => void commit()} data-testid="import-commit">
                Import {summary.n.toLocaleString()} candles
              </button>
            </>
          )}
          {phase === "done" && (
            <button type="button" className="btn btn-primary ml-auto" onClick={close} data-testid="import-done">
              Done
            </button>
          )}
          {(phase === "pick" || phase === "detecting") && (
            <button type="button" className="btn btn-secondary ml-auto" onClick={close}>
              Cancel
            </button>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-3 py-2 text-sm text-loss" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {(phase === "pick" || phase === "detecting") && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void pickFile(f);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
            dragOver ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent/60",
          )}
        >
          {phase === "detecting" ? <Loader2 className="h-8 w-8 animate-spin text-accent" /> : <Upload className="h-8 w-8 text-muted" />}
          <span className="mt-3 text-sm font-semibold">{phase === "detecting" ? `Reading ${file?.name}…` : "Drop a .csv or .zip file here, or click to browse"}</span>
          <span className="mt-1 text-xs text-muted">Large files are fine — they are streamed, never uploaded anywhere.</span>
          <input
            type="file"
            accept=".csv,.txt,.zip,text/csv,application/zip"
            className="sr-only"
            data-testid="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickFile(f);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {phase === "map" && config && detection && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{PRESET_LABEL[config.preset]}</span>
            <span className="text-muted">{detection.entryName ?? file?.name}</span>
            <span className="text-faint">· {(detection.totalBytes / 1_048_576).toFixed(1)} MB</span>
          </div>
          {detection.warnings.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
              {detection.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}

          <div>
            <div className="mb-1.5 text-xs font-medium text-muted">Column mapping (first rows of the file)</div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-2">
                  <tr>
                    {config.columns.map((role, i) => (
                      <th key={i} className="p-1.5 text-left font-normal">
                        <div className="mb-1 truncate text-[10px] text-faint">{detection.headers[i] ?? `Column ${i + 1}`}</div>
                        <select className="input !py-1 !pl-2 text-xs" value={role} onChange={(e) => setCol(i, e.target.value as ColumnRole)} aria-label={`Role of column ${i + 1}`}>
                          {COLUMN_ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detection.sample.slice(0, 6).map((row, r) => (
                    <tr key={r} className="border-t border-border">
                      {config.columns.map((_, i) => (
                        <td key={i} className="whitespace-nowrap px-2 py-1 font-mono text-[11px] text-muted">
                          {row[i]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Instrument" hint={spec ? spec.description : "e.g. EURUSD, GBPJPY, XAUUSD"}>
              <input
                className="input uppercase"
                list="import-symbols"
                value={config.symbol}
                disabled={Boolean(appendTo)}
                onChange={(e) => setConfig({ ...config, symbol: normalizeSymbol(e.target.value) })}
                data-testid="import-symbol"
              />
              <datalist id="import-symbols">
                {INSTRUMENTS.map((i) => (
                  <option key={i.symbol} value={i.symbol} />
                ))}
              </datalist>
            </Field>
            <Field label="Data type">
              <select className="input" value={config.kind} onChange={(e) => setConfig({ ...config, kind: e.target.value as ImportConfig["kind"] })}>
                <option value="bars">Candles (OHLC)</option>
                <option value="ticks">Ticks → aggregate to M1</option>
              </select>
            </Field>
            <Field label="Prices are" hint="Execution applies the spread relative to this basis.">
              <select className="input" value={config.priceBasis} onChange={(e) => setConfig({ ...config, priceBasis: e.target.value as PriceBasis })} data-testid="import-basis">
                <option value="bid">Bid</option>
                <option value="ask">Ask</option>
                <option value="mid">Mid-point</option>
                <option value="unknown">Unknown (treated as mid)</option>
              </select>
            </Field>
            <Field label="Timestamp format">
              <select className="input" value={config.tsFormat} onChange={(e) => setConfig({ ...config, tsFormat: e.target.value as ImportConfig["tsFormat"] })}>
                {TS_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label} — {f.example}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source time zone" hint="Timestamps are converted to UTC on import.">
              <select className="input" value={config.timezone} onChange={(e) => setConfig({ ...config, timezone: e.target.value })} data-testid="import-tz">
                {SOURCE_TIMEZONES.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Delimiter">
              <select className="input" value={config.delimiter} onChange={(e) => setConfig({ ...config, delimiter: e.target.value })}>
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
                <option value={"\t"}>Tab</option>
                <option value="|">Pipe</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle checked={config.hasHeader} onChange={(v) => setConfig({ ...config, hasHeader: v })} label="First row is a header" />
            <Toggle checked={config.decimalComma} onChange={(v) => setConfig({ ...config, decimalComma: v })} label="Decimal comma (1,2345)" />
          </div>

          {!appendTo && (
            <div className="rounded-xl border border-border p-3">
              <div className="mb-2 text-xs font-medium text-muted">Save as</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="chip" data-active={target.mode === "new"} onClick={() => setTarget({ ...target, mode: "new" })}>
                  New dataset
                </button>
                <button type="button" className="chip" data-active={target.mode === "append"} disabled={!appendCandidates.length} onClick={() => setTarget({ ...target, mode: "append", datasetId: appendCandidates[0]?.id })}>
                  Add to existing dataset{appendCandidates.length ? "" : " (none for this symbol)"}
                </button>
              </div>
              <div className="mt-2">
                {target.mode === "new" ? (
                  <input className="input" placeholder="Dataset name" value={target.name} onChange={(e) => setTarget({ ...target, name: e.target.value })} aria-label="Dataset name" />
                ) : (
                  <select className="input" value={target.datasetId} onChange={(e) => setTarget({ ...target, datasetId: e.target.value })} aria-label="Dataset to append to">
                    {appendCandidates.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {d.timeframe}, {formatInTz(d.firstT, "UTC", "date")} → {formatInTz(d.lastT, "UTC", "date")}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {configErrors.length > 0 && (
            <ul className="space-y-0.5 text-xs text-loss">
              {configErrors.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {phase === "parsing" && (
        <div className="py-10 text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-accent" />
          <p className="mt-3 text-sm font-medium">Parsing and checking {file?.name}…</p>
          <div className="mx-auto mt-3 h-1.5 max-w-sm overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-2 text-xs tabular-nums text-muted">{Math.round(progress * 100)}%</p>
        </div>
      )}

      {(phase === "review" || phase === "committing") && summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Candles" value={summary.n.toLocaleString()} />
            <Stat label="Timeframe" value={summary.timeframe ?? (summary.detectedSeconds ? `${summary.detectedSeconds}s (unsupported)` : "—")} bad={!summary.timeframe} />
            <Stat label="Prices" value={`${summary.priceBasis}${summary.hasSpread ? " + spread" : ""}`} bad={summary.priceBasis === "unknown"} />
            <Stat label="Instrument" value={spec?.symbol ?? "—"} />
          </div>
          {summary.n > 0 && (
            <p className="text-sm">
              Coverage <span className="font-semibold tabular-nums">{formatInTz(summary.firstT, "UTC", "datetime")}</span> →{" "}
              <span className="font-semibold tabular-nums">{formatInTz(summary.lastT, "UTC", "datetime")}</span> UTC
              {summary.derivedFromTicks && <span className="text-muted"> · aggregated from ticks into M1</span>}
            </p>
          )}
          {!summary.timeframe && <p className="text-sm text-loss">The candle spacing doesn’t match a supported timeframe (M1, M5, M15, M30, H1, H4, D1, W1). Nothing can be imported.</p>}
          {tfMismatch && <p className="text-sm text-loss">This file’s timeframe doesn’t match the dataset you’re appending to.</p>}
          <QualitySummary q={summary.quality} />
          <p className="text-[11px] text-muted">Nothing has been saved yet. Review the report, then import.</p>
          {phase === "committing" && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Saving to the database…
            </p>
          )}
        </div>
      )}

      {phase === "done" && result && (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-profit" />
          <p className="mt-2 text-base font-semibold">Imported into “{result.dataset.name}”</p>
          <p className="mt-1 text-sm text-muted">
            {result.added.toLocaleString()} new candles
            {result.duplicates ? ` · ${result.duplicates.toLocaleString()} already present${result.conflicts ? ` (${result.conflicts} with different prices — existing kept)` : ""}` : ""}. Dataset now covers{" "}
            {formatInTz(result.dataset.firstT, "UTC", "date")} → {formatInTz(result.dataset.lastT, "UTC", "date")}.
          </p>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold", bad && "text-loss")}>{value}</div>
    </div>
  );
}
