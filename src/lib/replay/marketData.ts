import { FXCM, fxcmEarliestT, fxcmSupports, latestPublishedSunday, planFxcmChunks, providerDatasetId, weekSundayOf, type FxcmChunk } from "./providers/fxcm";
import { conversionPair, needsConversionRate, resolveInstrument } from "./instruments";
import { ApiError, getDataset, loadBars } from "./storage/repo";
import { CONTEXT_TF, historyPlan } from "./history";
import type { DatasetMeta, ReplaySession, Timeframe } from "./types";

// Market-data service (browser side). Resolves a request (symbol, resolution,
// range) to the provider's weekly files, reuses what the database already
// holds, and asks the server to download, validate and store only the missing
// weeks — one week per request, with bounded retries that honour Retry-After.
// Every stored week is committed with its coverage record in one database
// transaction, so cancelling or crashing never loses or double-counts data.

export { providerDatasetId };

export interface DataRequest {
  provider: "fxcm";
  symbol: string;
  resolution: Timeframe;
  fromT: number;
  toT: number;
}

/**
 * What a provider session needs: base candles from ~3 months before the start
 * to the end, plus hourly candles for any older history (chart only).
 */
export function sessionDataRequests(s: Pick<ReplaySession, "symbol" | "historyStartT" | "startT" | "endT" | "source" | "settings">): { fine: DataRequest; context: DataRequest | null } {
  const resolution = s.source?.resolution ?? "M1";
  const plan = historyPlan(s, resolution, s.settings.dayBoundary);
  return {
    fine: { provider: "fxcm", symbol: s.symbol, resolution, fromT: plan.fineFromT, toT: s.endT },
    context: plan.context ? { provider: "fxcm", symbol: s.symbol, resolution: CONTEXT_TF, fromT: plan.context.fromT, toT: plan.context.toT - 1 } : null,
  };
}

export type Stage = "check-cache" | "check-provider" | "download" | "validate" | "save" | "prepare" | "done";

export interface PipelineProgress {
  stage: Stage;
  message: string;
  chunksTotal: number;
  chunksCached: number;
  /** Chunks processed in this run (downloaded or found missing). */
  chunksDone: number;
  /** All missing chunks (known before this run + newly found). */
  chunksMissing: number;
  /** Missing chunks known before this run (skipped, not re-requested). */
  chunksKnownMissing: number;
  bytes: number;
  candlesDownloaded: number;
  candlesCached: number;
  /** Rows the provider sent that failed validation (never stored). */
  rejected: number;
  retrying: { chunk: string; attempt: number; waitMs: number; reason: string } | null;
}

export interface PipelineResult {
  datasetId: string;
  progress: PipelineProgress;
  /** Weeks the provider has no file for (or published nothing in-window). */
  missing: string[];
  /** Weeks not yet published (too recent). */
  unpublished: string[];
  cancelled: boolean;
  dataset: DatasetMeta | null;
}

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export interface IngestResponse {
  key: string;
  status: "ok" | "empty" | "missing";
  candles: number;
  bytes: number;
  added: number;
  rejected: number;
}

/** The server calls the pipeline needs — injectable for tests. */
export interface MarketDataApi {
  getDataset(id: string): Promise<DatasetMeta | undefined>;
  probe(req: DataRequest, chunk: FxcmChunk, signal?: AbortSignal): Promise<{ status: "ok" | "missing"; bytes: number | null }>;
  ingest(req: DataRequest, chunk: FxcmChunk, signal?: AbortSignal): Promise<IngestResponse>;
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status}).`, res.status, { ...data, retryAfter: data.retryAfter ?? (Number(res.headers.get("retry-after")) || null) });
  return data;
}

export const httpApi: MarketDataApi = {
  getDataset,
  async probe(req, chunk, signal) {
    const q = new URLSearchParams({ symbol: req.symbol, res: req.resolution, year: String(chunk.year), week: String(chunk.week), from: String(chunk.fromT) });
    return readJson(await fetch(`/api/replay/data/fxcm?${q}`, { credentials: "same-origin", signal }));
  },
  async ingest(req, chunk, signal) {
    const res = await fetch("/api/replay/data/fxcm", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: req.symbol, res: req.resolution, year: chunk.year, week: chunk.week, fromT: chunk.fromT }),
      signal,
    });
    return readJson(res);
  },
};

export interface PipelineOptions {
  onProgress?: (p: PipelineProgress) => void;
  signal?: AbortSignal;
  api?: MarketDataApi;
  nowSec?: number;
  concurrency?: number;
  maxAttempts?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

function blankProgress(): PipelineProgress {
  return { stage: "check-cache", message: "Checking stored history…", chunksTotal: 0, chunksCached: 0, chunksDone: 0, chunksMissing: 0, chunksKnownMissing: 0, bytes: 0, candlesDownloaded: 0, candlesCached: 0, rejected: 0, retrying: null };
}

interface Plan {
  chunks: FxcmChunk[];
  pending: FxcmChunk[];
  unpublished: FxcmChunk[];
  knownMissing: FxcmChunk[];
  cachedCandles: number;
  cachedCount: number;
}

/** Split the requested weeks into stored / to download / not yet published. */
export function planRequest(req: DataRequest, ds: DatasetMeta | undefined, nowSec: number): Plan {
  // The week holding 1 Jan of the first year opens in the previous December
  // (e.g. 2011-W52); FXCM never has files for years before its first.
  const chunks = planFxcmChunks(Math.max(req.fromT, fxcmEarliestT()), req.toT).filter((c) => c.year >= FXCM.firstYear);
  const latest = latestPublishedSunday(nowSec);
  const cov = ds?.provider?.chunks ?? {};
  const plan: Plan = { chunks, pending: [], unpublished: [], knownMissing: [], cachedCandles: 0, cachedCount: 0 };
  for (const c of chunks) {
    const sunday = weekSundayOf(c.fromT);
    const st = cov[c.key];
    if (st && st.status !== "missing") {
      plan.cachedCount++;
      plan.cachedCandles += st.n;
      continue;
    }
    // A week whose file was missing is re-checked only while it is recent.
    if (st?.status === "missing" && (sunday < latest - 28 * 86_400 || nowSec * 1000 - st.fetchedAt < 6 * 3600 * 1000)) {
      plan.knownMissing.push(c);
      continue;
    }
    if (sunday > latest + 7 * 86_400) {
      plan.unpublished.push(c);
      continue;
    }
    plan.pending.push(c);
  }
  return plan;
}

/** Retryable = provider busy/unreachable or our server briefly unavailable. */
function retryable(e: unknown): { wait: number; reason: string } | null {
  if (e instanceof ApiError) {
    if (e.body.setup) return null; // tables missing — retrying won't help
    if ([0, 429, 502, 503, 504].includes(e.status)) return { wait: (e.body.retryAfter ?? 0) * 1000, reason: e.message };
    return null;
  }
  if (e instanceof TypeError) return { wait: 0, reason: "network error" };
  return null;
}

/**
 * Make sure the requested range is stored in the database, downloading only
 * missing weeks. Never invents candles: weeks without a file are reported.
 */
export async function ensureProviderData(req: DataRequest, opts: PipelineOptions = {}): Promise<PipelineResult> {
  if (req.provider !== "fxcm" || !fxcmSupports(req.symbol, req.resolution)) {
    throw new ProviderUnavailableError(`${req.symbol} ${req.resolution} is not available from ${FXCM.name}.`);
  }
  const api = opts.api ?? httpApi;
  const sleep = opts.sleep ?? defaultSleep;
  const nowSec = opts.nowSec ?? Date.now() / 1000;
  const maxAttempts = opts.maxAttempts ?? 5;
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const signal = opts.signal;
  const datasetId = providerDatasetId(req);
  const p = blankProgress();
  const emit = (patch: Partial<PipelineProgress>) => {
    Object.assign(p, patch);
    opts.onProgress?.({ ...p });
  };

  emit({ stage: "check-cache", message: "Checking stored history…" });
  let ds = await api.getDataset(datasetId);
  const plan = planRequest(req, ds, nowSec);
  emit({
    chunksTotal: plan.chunks.length,
    chunksCached: plan.cachedCount,
    candlesCached: plan.cachedCandles,
    chunksMissing: plan.knownMissing.length,
    chunksKnownMissing: plan.knownMissing.length,
  });
  const missing = plan.knownMissing.map((c) => c.key);
  const unpublished = plan.unpublished.map((c) => c.key);
  if (!plan.pending.length) {
    emit({ stage: "done", message: plan.cachedCount ? "All requested history is already stored." : "No data is published for this range." });
    return { datasetId, progress: { ...p }, missing, unpublished, cancelled: false, dataset: ds ?? null };
  }

  const withRetry = async <T>(chunk: FxcmChunk, fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (isAbort(e)) throw e;
        const r = retryable(e);
        if (!r) throw e instanceof ApiError ? new ProviderUnavailableError(e.message) : e;
        if (attempt >= maxAttempts) throw new ProviderUnavailableError(`${FXCM.name} did not respond for week ${chunk.key} after ${maxAttempts} attempts (${r.reason}).`);
        const backoff = Math.min(60_000, Math.max(r.wait, 1000 * 2 ** (attempt - 1)));
        emit({ retrying: { chunk: chunk.key, attempt, waitMs: backoff, reason: r.reason } });
        await sleep(backoff, signal);
        emit({ retrying: null });
      }
    }
  };

  // Fail fast with a clear message when the provider is down entirely.
  emit({ stage: "check-provider", message: `Checking ${FXCM.name} availability…` });
  try {
    await withRetry(plan.pending[0], () => api.probe(req, plan.pending[0], signal));
  } catch (e) {
    if (isAbort(e)) return { datasetId, progress: { ...p }, missing, unpublished, cancelled: true, dataset: ds ?? null };
    throw e;
  }

  emit({ stage: "download", message: `Downloading ${plan.pending.length} week(s) of ${req.symbol} ${req.resolution}…` });
  const queue = plan.pending.slice();
  let fatal: unknown = null;
  const workerLoop = async () => {
    while (queue.length && !fatal && !signal?.aborted) {
      const chunk = queue.shift()!;
      try {
        const r = await withRetry(chunk, () => api.ingest(req, chunk, signal));
        if (r.status === "missing") {
          missing.push(chunk.key);
          emit({ chunksDone: p.chunksDone + 1, chunksMissing: p.chunksMissing + 1, message: `Week ${chunk.key}: no file published — recorded as a gap` });
        } else {
          emit({
            stage: "save",
            message: `Stored ${chunk.key}: ${r.candles.toLocaleString()} validated candles`,
            chunksDone: p.chunksDone + 1,
            bytes: p.bytes + r.bytes,
            candlesDownloaded: p.candlesDownloaded + r.candles,
            rejected: p.rejected + r.rejected,
          });
        }
      } catch (e) {
        if (isAbort(e)) return;
        fatal = e;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, workerLoop));
  ds = await api.getDataset(datasetId).catch(() => ds);
  if (signal?.aborted) {
    emit({ message: "Cancelled — stored weeks are kept and will be reused." });
    return { datasetId, progress: { ...p }, missing, unpublished, cancelled: true, dataset: ds ?? null };
  }
  if (fatal) throw fatal;
  emit({ stage: "done", message: "History ready." });
  return { datasetId, progress: { ...p }, missing, unpublished, cancelled: false, dataset: ds ?? null };
}

// ---------------------------------------------------------------------------
// Availability check (before a session is created)
// ---------------------------------------------------------------------------

export interface Availability {
  supported: boolean;
  reason?: string;
  /** Range the provider can actually serve (clamped to its coverage). */
  fromT: number;
  toT: number;
  chunksTotal: number;
  chunksCached: number;
  chunksToDownload: number;
  /** Estimated download size (bytes) from probed file sizes, or null. */
  estimatedBytes: number | null;
  estimatedCandles: number;
  warnings: string[];
  probes: { chunk: string; status: "ok" | "missing" | "error" }[];
}

export async function checkAvailability(req: DataRequest, opts: { api?: MarketDataApi; nowSec?: number; signal?: AbortSignal } = {}): Promise<Availability> {
  const api = opts.api ?? httpApi;
  const nowSec = opts.nowSec ?? Date.now() / 1000;
  const warnings: string[] = [];
  const base: Availability = { supported: false, fromT: req.fromT, toT: req.toT, chunksTotal: 0, chunksCached: 0, chunksToDownload: 0, estimatedBytes: null, estimatedCandles: 0, warnings, probes: [] };
  if (!fxcmSupports(req.symbol, req.resolution)) {
    return { ...base, reason: `${req.symbol} isn't in FXCM's free candle archive. Import a CSV for it instead (HistData offers XAU/USD and many more).` };
  }
  let fromT = req.fromT;
  let toT = req.toT;
  if (fromT < fxcmEarliestT()) {
    warnings.push(`FXCM history starts in ${FXCM.firstYear}; the period was shortened to begin on 1 Jan ${FXCM.firstYear}.`);
    fromT = fxcmEarliestT();
  }
  const latestEnd = latestPublishedSunday(nowSec) + 7 * 86_400 - 2 * 86_400; // Friday close of the latest published week
  if (toT > latestEnd) {
    warnings.push(`FXCM publishes each week with a delay of about 1–2 weeks; data is expected up to about ${new Date(latestEnd * 1000).toISOString().slice(0, 10)}.`);
    toT = latestEnd;
  }
  if (!(toT > fromT)) return { ...base, fromT, toT, reason: "No published data falls in this period." };
  const ds = await api.getDataset(providerDatasetId(req));
  const plan = planRequest({ ...req, fromT, toT }, ds, nowSec);
  const probes: Availability["probes"] = [];
  const sizes: number[] = [];
  const toProbe = plan.pending.length > 1 ? [plan.pending[0], plan.pending[plan.pending.length - 1]] : plan.pending;
  for (const c of toProbe) {
    try {
      const r = await api.probe(req, c, opts.signal);
      probes.push({ chunk: c.key, status: r.status });
      if (r.status === "ok" && r.bytes) sizes.push(r.bytes);
    } catch (e) {
      if (isAbort(e)) throw e;
      probes.push({ chunk: c.key, status: "error" });
    }
  }
  if (probes.some((x) => x.status === "error")) warnings.push("Couldn't reach FXCM to confirm availability — the download will retry automatically.");
  for (const pr of probes.filter((x) => x.status === "missing")) warnings.push(`Week ${pr.chunk} has no published file; it will be reported as a gap.`);
  if (plan.knownMissing.length) warnings.push(`${plan.knownMissing.length} week(s) in this period are known to be missing from the archive.`);
  const avg = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : null;
  const perWeek = req.resolution === "M1" ? 7150 : 120;
  return {
    supported: true,
    fromT,
    toT,
    chunksTotal: plan.chunks.length,
    chunksCached: plan.cachedCount,
    chunksToDownload: plan.pending.length,
    estimatedBytes: avg !== null ? Math.round(avg * plan.pending.length) : null,
    estimatedCandles: plan.cachedCandles + plan.pending.length * perWeek,
    warnings,
    probes,
  };
}

// ---------------------------------------------------------------------------
// Conversion-rate assist for crosses
// ---------------------------------------------------------------------------

/**
 * For a cross (e.g. EURJPY on a USD account), estimate "1 quote = X account"
 * from the conversion pair's real FXCM closes in the week before `atT`
 * (H1 data, a few KB). Returns null when the pair isn't downloadable.
 */
export async function suggestConversionRate(
  symbol: string,
  accountCurrency: string,
  atT: number,
  opts: PipelineOptions = {},
): Promise<{ rate: number; pair: string; pairPrice: number } | null> {
  const spec = resolveInstrument(symbol);
  if (!spec || !needsConversionRate(spec, accountCurrency)) return null;
  const { pair, invert } = conversionPair(spec, accountCurrency);
  if (!fxcmSupports(pair, "H1")) return null;
  const req: DataRequest = { provider: "fxcm", symbol: pair, resolution: "H1", fromT: atT - 10 * 86_400, toT: atT };
  await ensureProviderData(req, opts);
  const bars = await loadBars(providerDatasetId(req), req.fromT, req.toT);
  if (!bars.n) return null;
  let sum = 0;
  for (let i = 0; i < bars.n; i++) sum += bars.c[i];
  const pairPrice = sum / bars.n;
  return { rate: invert ? 1 / pairPrice : pairPrice, pair, pairPrice };
}
