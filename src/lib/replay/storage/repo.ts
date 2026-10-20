import { concatBars, emptyBars, lowerBound, sliceBars } from "../bars";
import type { ParsedImport } from "../csv";
import { chooseScale, packBars, unpackBars } from "../pack";
import type { Bars, DatasetMeta, JournalEntry, QualityReport, ReplaySession, SourcePreset, StrategyTemplate } from "../types";

// Client for Replay's server API. All data — datasets, candles, sessions,
// journal, templates — lives in the app's PostgreSQL database; the browser
// keeps nothing but UI preferences. Works in the page and in Web Workers.

const BASE = "/api/replay";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: { error?: string; setup?: boolean; busy?: boolean; retryAfter?: number | null } = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      credentials: "same-origin",
      ...init,
      signal: signal ?? init.signal,
      headers: init.body && typeof init.body === "string" ? { "Content-Type": "application/json", ...init.headers } : init.headers,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("Couldn't reach the server. Check your connection and that the app is running.", 0);
  }
  if (!res.ok) {
    let body: ApiError["body"] = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error
    }
    const msg = body.error ?? (res.status === 401 ? "Your sign-in expired — reload the page and sign in again." : `Request failed (${res.status}).`);
    throw new ApiError(msg, res.status, { ...body, retryAfter: body.retryAfter ?? (Number(res.headers.get("retry-after")) || null) });
  }
  return (await res.json()) as T;
}

const jsonBody = (v: unknown) => JSON.stringify(v);

export function newId(prefix = ""): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `${prefix}${rand}`;
}

// ---------------------------------------------------------------------------
// Datasets & candles
// ---------------------------------------------------------------------------

export async function listDatasets(): Promise<DatasetMeta[]> {
  return call<DatasetMeta[]>("/datasets");
}

export async function getDataset(id: string): Promise<DatasetMeta | undefined> {
  try {
    return await call<DatasetMeta>(`/datasets/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
}

export async function renameDataset(id: string, name: string): Promise<void> {
  await call(`/datasets/${encodeURIComponent(id)}`, { method: "PATCH", body: jsonBody({ name }) });
}

export async function deleteDataset(id: string): Promise<void> {
  await call(`/datasets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface WriteResult {
  added: number;
  duplicates: number;
  conflicts: number;
  daysWritten: number;
}

/** Upload candles to a dataset in ~month-sized requests. */
export async function uploadBars(datasetId: string, bars: Bars, onProgress?: (done: number, total: number) => void): Promise<WriteResult> {
  const total: WriteResult = { added: 0, duplicates: 0, conflicts: 0, daysWritten: 0 };
  const step = 45_000;
  for (let i = 0; i < bars.n; i += step) {
    const part = sliceBars(bars, i, Math.min(bars.n, i + step));
    const body = await gzip(packBars(part, chooseScale(part, 2)));
    const r = await call<WriteResult>(`/datasets/${encodeURIComponent(datasetId)}/candles`, { method: "PUT", body: body as BodyInit, headers: { "Content-Type": "application/octet-stream" } });
    total.added += r.added;
    total.duplicates += r.duplicates;
    total.conflicts += r.conflicts;
    total.daysWritten += r.daysWritten;
    onProgress?.(Math.min(bars.n, i + step), bars.n);
  }
  return total;
}

export interface ImportTarget {
  mode: "new" | "append";
  datasetId?: string;
  name?: string;
}

export interface ImportCommitInput {
  parsed: ParsedImport;
  symbol: string;
  source: SourcePreset;
  sourceTimezone: string;
  fileName: string;
  fileSize: number;
  target: ImportTarget;
  onProgress?: (done: number, total: number) => void;
}

export interface ImportCommitResult {
  dataset: DatasetMeta;
  added: number;
  duplicates: number;
  conflicts: number;
}

/** Store parsed file candles in the database (new dataset or appended). */
export async function commitImport(input: ImportCommitInput): Promise<ImportCommitResult> {
  const { parsed } = input;
  if (!parsed.timeframe) throw new Error("Unsupported or undetected timeframe — nothing was imported.");
  if (parsed.bars.n === 0) throw new Error("The file contained no valid candles — nothing was imported.");
  let ds: DatasetMeta;
  if (input.target.mode === "append") {
    const existing = input.target.datasetId ? await getDataset(input.target.datasetId) : undefined;
    if (!existing) throw new Error("The dataset to append to no longer exists.");
    if (existing.provider) throw new Error("Downloaded datasets can't be appended to — import into a new dataset.");
    if (existing.timeframe !== parsed.timeframe) throw new Error(`Timeframe mismatch: dataset is ${existing.timeframe}, file is ${parsed.timeframe}.`);
    if (existing.symbol !== input.symbol) throw new Error(`Symbol mismatch: dataset is ${existing.symbol}, file is ${input.symbol}.`);
    ds = existing;
  } else {
    ds = await call<DatasetMeta>("/datasets", {
      method: "POST",
      body: jsonBody({
        name: input.target.name?.trim() || `${input.symbol} ${parsed.timeframe}`,
        symbol: input.symbol,
        timeframe: parsed.timeframe,
        source: input.source,
        priceBasis: parsed.priceBasis,
        sourceTimezone: input.sourceTimezone,
        hasSpread: parsed.hasSpread,
        derivedFromTicks: parsed.derivedFromTicks,
      }),
    });
  }
  const w = await uploadBars(ds.id, parsed.bars, input.onProgress);
  const quality: QualityReport = { ...parsed.quality, duplicates: parsed.quality.duplicates + w.duplicates, conflictingDuplicates: parsed.quality.conflictingDuplicates + w.conflicts };
  const dataset = await call<DatasetMeta>(`/datasets/${encodeURIComponent(ds.id)}`, {
    method: "PATCH",
    body: jsonBody({ addFile: { name: input.fileName, size: input.fileSize, importedAt: Date.now(), rows: parsed.quality.rowsRead }, mergeQuality: quality, hasSpread: parsed.hasSpread }),
  });
  return { dataset, added: w.added, duplicates: w.duplicates, conflicts: w.conflicts };
}

const WINDOW = 31 * 86_400;

/**
 * Candles in [fromT, toT], fetched in month-sized windows (4 in parallel) so
 * long sessions stream in with progress instead of one huge response.
 */
export async function loadBars(
  datasetId: string,
  fromT: number,
  toT: number,
  opts: { onProgress?: (loadedWindows: number, totalWindows: number, bars: number) => void; signal?: AbortSignal; /** Aggregate to hourly on the server. */ hourly?: boolean } = {},
): Promise<Bars> {
  if (!(toT >= fromT)) return emptyBars();
  const windows: [number, number][] = [];
  const size = opts.hourly ? 365 * 86_400 : WINDOW;
  // Hourly windows start on the hour so no hour is split between two requests.
  const start = opts.hourly ? Math.floor(fromT / 3600) * 3600 : fromT;
  for (let a = start; a <= toT; a += size) windows.push([a, Math.min(toT, a + size - 1)]);
  const parts: Bars[] = new Array(windows.length);
  let next = 0;
  let done = 0;
  let bars = 0;
  const worker = async () => {
    while (next < windows.length) {
      const k = next++;
      const [a, b] = windows[k];
      let res: Response;
      try {
        res = await fetch(`${BASE}/datasets/${encodeURIComponent(datasetId)}/candles?from=${a}&to=${b}${opts.hourly ? "&tf=H1" : ""}`, { credentials: "same-origin", signal: opts.signal });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        throw new ApiError("Couldn't reach the server while loading candles.", 0);
      }
      if (!res.ok) {
        let msg = `Loading candles failed (${res.status}).`;
        try {
          msg = (await res.json()).error ?? msg;
        } catch {
          // ignore
        }
        throw new ApiError(msg, res.status);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      const all = buf.byteLength ? unpackBars(buf) : emptyBars();
      // Day rows overlap window edges — keep only this window's candles.
      parts[k] = sliceBars(all, lowerBound(all.t, all.n, a), lowerBound(all.t, all.n, b + 1e-6));
      done++;
      bars += parts[k].n;
      opts.onProgress?.(done, windows.length, bars);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, windows.length) }, worker));
  const nonEmpty = parts.filter((p) => p && p.n);
  if (!nonEmpty.length) return emptyBars();
  return nonEmpty.length === 1 ? nonEmpty[0] : concatBars(nonEmpty);
}

// ---------------------------------------------------------------------------
// Sessions & journal
// ---------------------------------------------------------------------------

/** Session lists omit commands, drawings and screenshots (see `getSession` for everything). */
export async function listSessions(view: "summary" | "analytics" = "summary"): Promise<ReplaySession[]> {
  return call<ReplaySession[]>(`/sessions?view=${view}`);
}

export async function getSession(id: string): Promise<ReplaySession | undefined> {
  try {
    return await call<ReplaySession>(`/sessions/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
}

/**
 * Persist a full session. New sessions are created; existing ones are saved
 * atomically against their revision (a 409 ApiError means someone else saved
 * first). Returns the new revision.
 */
export async function saveSession(s: ReplaySession): Promise<{ revision: number; updatedAt: number }> {
  if (s.revision === undefined) {
    const created = await call<ReplaySession>("/sessions", { method: "POST", body: jsonBody(s) });
    return { revision: created.revision ?? 1, updatedAt: created.updatedAt };
  }
  return call(`/sessions/${encodeURIComponent(s.id)}`, { method: "PUT", body: jsonBody({ session: s, baseRevision: s.revision }) });
}

export interface SessionPatch {
  name?: string;
  favorite?: boolean;
  archived?: boolean;
  tags?: string[];
  strategy?: string;
  notes?: string;
  description?: string;
}

export async function patchSession(id: string, patch: SessionPatch): Promise<ReplaySession> {
  return call<ReplaySession>(`/sessions/${encodeURIComponent(id)}`, { method: "PATCH", body: jsonBody(patch) });
}

export async function deleteSession(id: string): Promise<void> {
  await call(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function sessionsForDataset(datasetId: string): Promise<ReplaySession[]> {
  return (await listSessions()).filter((s) => s.datasetId === datasetId);
}

export async function saveJournalEntry(sessionId: string, tradeId: string, entry: JournalEntry | null): Promise<void> {
  await call(`/sessions/${encodeURIComponent(sessionId)}/journal`, { method: "PUT", body: jsonBody({ tradeId, entry }) });
}

export async function pruneJournalEntries(sessionId: string, keep: string[]): Promise<void> {
  await call(`/sessions/${encodeURIComponent(sessionId)}/journal`, { method: "POST", body: jsonBody({ keep }) });
}

// ---------------------------------------------------------------------------
// Settings stored in the database
// ---------------------------------------------------------------------------

async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const r = await call<{ value: T | null }>(`/meta/${key}`);
  return r.value ?? fallback;
}

async function setMeta(key: string, value: unknown): Promise<void> {
  await call(`/meta/${key}`, { method: "PUT", body: jsonBody({ value }) });
}

export async function listStrategies(): Promise<StrategyTemplate[]> {
  return getMeta<StrategyTemplate[]>("strategies", []);
}

export async function saveStrategies(list: StrategyTemplate[]): Promise<void> {
  await setMeta("strategies", list);
}

export interface InstrumentPrefs {
  favorites: string[];
  recent: string[];
}

export async function getInstrumentPrefs(): Promise<InstrumentPrefs> {
  return getMeta<InstrumentPrefs>("instrumentPrefs", { favorites: [], recent: [] });
}

export async function saveInstrumentPrefs(prefs: InstrumentPrefs): Promise<void> {
  await setMeta("instrumentPrefs", { favorites: prefs.favorites.slice(0, 50), recent: prefs.recent.slice(0, 8) });
}

// ---------------------------------------------------------------------------
// Backup, restore, status
// ---------------------------------------------------------------------------

export const BACKUP_FORMAT = "moblog-replay-backup";

export interface RestoreSummary {
  datasets: number;
  sessions: number;
  days: number;
  skipped: number;
}

export async function exportBackup(includeCandles: boolean): Promise<Blob> {
  const res = await fetch(`${BASE}/backup${includeCandles ? "?candles=1" : ""}`, { credentials: "same-origin" });
  if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error ?? `Backup failed (${res.status}).`, res.status);
  return res.blob();
}

export async function importBackup(file: unknown, overwrite: boolean): Promise<RestoreSummary> {
  return call<RestoreSummary>("/backup", { method: "POST", body: jsonBody({ file, overwrite }) });
}

export interface StorageStatus {
  storage: { bytes: number; datasets: number; days: number; candles: number; sessions: number; tables: Record<string, number> };
  database: string;
}

export async function storageStatus(): Promise<StorageStatus> {
  return call<StorageStatus>("/status");
}

/** True when a dataset's metadata exists but its candles weren't restored. */
export function datasetMissingCandles(ds: DatasetMeta): boolean {
  return Boolean(ds.missingCandles);
}

export interface RangeCheck {
  bars: number;
  firstT: number | null;
  lastT: number | null;
  gapCount: number;
  largeGaps: { from: number; to: number; seconds: number }[];
  weekendGaps: number;
  misaligned: number;
}

/** Server-side gap/coverage check of stored candles in a range (read-only). */
export async function validateRange(datasetId: string, fromT: number, toT: number, timeframe: string): Promise<RangeCheck> {
  return call<RangeCheck>("/data/validate", { method: "POST", body: jsonBody({ datasetId, fromT, toT, timeframe }) });
}
