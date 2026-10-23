"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, CloudDownload, Loader2, RotateCcw, X } from "lucide-react";
import { prepareData, type DataJob, type DataPart } from "@/lib/replay/dataClient";
import { sessionDataRequests, type PipelineProgress, type PipelineResult, type Stage } from "@/lib/replay/marketData";
import { AUTO_TERMS, PROVIDERS } from "@/lib/replay/providers";
import type { ProviderId, ReplaySession } from "@/lib/replay/types";
import { cn } from "@/lib/utils";

const STAGES: { label: string; detail?: string }[] = [
  { label: "Checking stored history", detail: "What the database already holds for this period" },
  { label: "Checking provider availability" },
  { label: "Downloading missing weeks", detail: "Each week comes from FXCM, or from Exness where FXCM's archive has a gap, and is validated and saved as it arrives" },
  { label: "Checking the period for gaps" },
  { label: "Preparing the selected timeframe", detail: "Loading candles from the database" },
  { label: "Initializing the replay" },
];

const ORDER: Record<Stage, number> = { "check-cache": 0, "check-provider": 1, download: 2, save: 2, validate: 3, prepare: 4, done: 3 };

export interface LoadProgress {
  loaded: number;
  total: number;
  bars: number;
}

export type Phase = "pipeline" | "validate" | "load" | "init";

const fmt = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const bytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(0)} KB`);

/**
 * Downloads (or reuses) a session's history before the workspace opens. All
 * figures come from the pipeline's real progress events — nothing is simulated.
 */
export default function PreparationScreen({
  session,
  onReady,
}: {
  session: ReplaySession;
  /** Validate, load and open; reports its own phases. */
  onReady: (r: PipelineResult, report: { phase: (p: Phase) => void; load: (l: LoadProgress) => void }) => Promise<void>;
}) {
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [part, setPart] = useState(0);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("pipeline");
  const [load, setLoad] = useState<LoadProgress | null>(null);
  const initializing = phase !== "pipeline";
  const job = useRef<DataJob | null>(null);
  const started = useRef(false);
  const resolution = session.source?.resolution ?? "M1";
  const parts: DataPart[] = (() => {
    const { fine, context } = sessionDataRequests(session);
    return context
      ? [
          { label: `${resolution === "M1" ? "1-minute" : resolution} data from ${fmt(fine.fromT)} (replay + recent history)`, request: fine },
          { label: `Older history as hourly candles, ${fmt(context.fromT)} → ${fmt(context.toT)}`, request: context },
        ]
      : [{ label: `${resolution === "M1" ? "1-minute" : resolution} data`, request: fine }];
  })();

  const finish = async (r: PipelineResult) => {
    setPhase("validate");
    try {
      await onReady(r, { phase: setPhase, load: setLoad });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("pipeline");
    }
  };

  const run = useCallback(() => {
    setError(null);
    setResult(null);
    setProgress(null);
    setPart(0);
    const j = prepareData(parts, (p, i) => {
      setPart(i);
      setProgress(p);
    });
    job.current = j;
    j.promise
      .then(async (r) => {
        job.current = null;
        if (r.cancelled) return;
        setResult(r);
        // Continue straight away unless the user should see missing weeks first.
        if (!r.missing.length) await finish(r);
      })
      .catch((e) => {
        job.current = null;
        setError(e instanceof Error ? e.message : String(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);


  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    return () => job.current?.cancel();
  }, [run]);

  const stageIdx = phase === "validate" ? 3 : phase === "load" ? 4 : phase === "init" ? 5 : progress ? ORDER[progress.stage] ?? 0 : 0;
  const total = progress?.chunksTotal ?? 0;
  const done = (progress?.chunksCached ?? 0) + (progress?.chunksKnownMissing ?? 0) + (progress?.chunksDone ?? 0);
  const pct = total ? Math.min(100, (done / total) * 100) : null;
  const cancelled = progress?.message.startsWith("Cancelled");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-background p-4" data-testid="preparation-screen">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <CloudDownload className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold">Preparing {session.name}</h1>
            <p className="mt-0.5 text-xs text-muted">
              {session.symbol} · {session.timeframe} chart · {resolution} execution data · {fmt(session.historyStartT)} → {fmt(session.endT)}
            </p>
          </div>
        </div>

        <ol className="mt-5 space-y-2 text-sm">
          {STAGES.map((s, i) => {
            const state = error && i === stageIdx ? "error" : i < stageIdx || (result && !initializing && i < 3) ? "done" : i === stageIdx ? "active" : "todo";
            return (
              <li key={s.label} className="flex items-start gap-2.5" data-state={state}>
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    state === "done" && "border-profit bg-profit text-white",
                    state === "active" && "border-accent text-accent",
                    state === "error" && "border-loss bg-loss text-white",
                    state === "todo" && "border-border text-faint",
                  )}
                >
                  {state === "done" ? <Check className="h-3 w-3" /> : state === "active" ? <Loader2 className="h-3 w-3 animate-spin" /> : state === "error" ? <X className="h-3 w-3" /> : null}
                </span>
                <span className="min-w-0">
                  <span className={cn("block", state === "todo" ? "text-faint" : "text-foreground", state === "active" && "font-medium")}>{s.label}</span>
                  {s.detail && state === "active" && <span className="block text-[11px] text-muted">{s.detail}</span>}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-5">
          {parts.length > 1 && !initializing && (
            <p className="mb-2 text-xs font-medium" data-testid="preparation-part">
              Part {part + 1} of {parts.length}: {parts[part].label}
            </p>
          )}
          {phase === "load" && load ? (
            <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round((load.loaded / Math.max(1, load.total)) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Candles loaded">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${(load.loaded / Math.max(1, load.total)) * 100}%` }} />
            </div>
          ) : pct !== null && !initializing ? (
            <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Weeks ready">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          ) : (
            <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Working">
              <div className="h-full w-1/3 animate-shimmer rounded-full" />
            </div>
          )}
          <p className="mt-2 text-xs text-muted" data-testid="preparation-message">
            {progress?.retrying
              ? `Retrying ${progress.retrying.chunk} in ${Math.round(progress.retrying.waitMs / 1000)}s (${progress.retrying.reason}, attempt ${progress.retrying.attempt})…`
              : phase === "validate"
                ? "Checking the stored candles for gaps in this period…"
                : phase === "load"
                  ? load
                    ? `Loaded ${load.bars.toLocaleString()} candles (${load.loaded} of ${load.total} months) from the database…`
                    : "Loading candles from the database…"
                  : phase === "init"
                    ? "Replaying recorded actions and opening the workspace…"
                    : progress?.message ?? "Starting…"}
          </p>
        </div>

        {progress && (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-border bg-surface-2/50 p-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted">Weeks</dt>
              <dd className="font-semibold tabular-nums">
                {done} / {total}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Already stored</dt>
              <dd className="font-semibold tabular-nums">{progress.chunksCached} weeks</dd>
            </div>
            <div>
              <dt className="text-muted">Downloaded</dt>
              <dd className="font-semibold tabular-nums">{bytes(progress.bytes)}</dd>
            </div>
            <div>
              <dt className="text-muted">New candles</dt>
              <dd className="font-semibold tabular-nums" data-testid="candles-downloaded">
                {progress.candlesDownloaded.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Stored candles</dt>
              <dd className="font-semibold tabular-nums">{progress.candlesCached.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-muted">Missing weeks</dt>
              <dd className={cn("font-semibold tabular-nums", progress.chunksMissing ? "text-warning" : undefined)}>{progress.chunksMissing}</dd>
            </div>
            <div>
              <dt className="text-muted">Rejected rows</dt>
              <dd className={cn("font-semibold tabular-nums", progress.rejected ? "text-warning" : undefined)} title="Rows that failed validation (bad prices or timestamps). They are never stored.">
                {progress.rejected}
              </dd>
            </div>
            {(Object.entries(progress.sources) as [ProviderId, number][]).map(([id, n]) => (
              <div key={id} data-testid={`source-${id}`}>
                <dt className="text-muted">From {PROVIDERS[id].short}</dt>
                <dd className="font-semibold tabular-nums">
                  {n} week{n === 1 ? "" : "s"}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {result && result.missing.length > 0 && !initializing && (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
            <p className="flex items-start gap-2 font-medium">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              No provider has {result.missing.length} week{result.missing.length === 1 ? "" : "s"} of this period; {result.missing.length === 1 ? "it" : "they"} will show as gaps: {result.missing.slice(0, 6).join(", ")}
              {result.missing.length > 6 ? "…" : ""}
            </p>
            <p className="mt-1 text-xs">Nothing is filled in for them. You can continue with the available data.</p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-loss/30 bg-loss-soft p-3 text-sm text-loss" role="alert">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
            <p className="mt-1 text-xs">Weeks that finished downloading are already in the database — retrying continues where it stopped.</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {!result && !error && !cancelled && (
            <button type="button" className="btn btn-secondary" onClick={() => job.current?.cancel()} data-testid="preparation-cancel">
              Cancel
            </button>
          )}
          {(error || cancelled) && (
            <>
              <Link href="/replay" className="btn btn-secondary">
                <ArrowLeft className="h-4 w-4" /> Sessions
              </Link>
              <button type="button" className="btn btn-primary" onClick={run} data-testid="preparation-retry">
                <RotateCcw className="h-4 w-4" /> {cancelled ? "Resume" : "Retry"}
              </button>
            </>
          )}
          {result && result.missing.length > 0 && !initializing && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void finish(result)}
              data-testid="preparation-continue"
            >
              Continue with available data
            </button>
          )}
        </div>
        <p className="mt-4 border-t border-border pt-3 text-[11px] leading-snug text-faint">
          Sources:{" "}
          <a href={PROVIDERS.fxcm.homepage} target="_blank" rel="noopener noreferrer" className="underline">
            {PROVIDERS.fxcm.name}
          </a>
          , with weeks FXCM lacks built from{" "}
          <a href={PROVIDERS.exness.homepage} target="_blank" rel="noopener noreferrer" className="underline">
            {PROVIDERS.exness.name}
          </a>
          . {AUTO_TERMS}
        </p>
      </div>
    </div>
  );
}
