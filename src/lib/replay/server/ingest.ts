import zlib from "node:zlib";
import { concatBars, emptyBars } from "../bars";
import { mergeQuality } from "../csv";
import { autoSupports, AUTO_FIRST_YEAR, isCompleteWeek, PROVIDERS, providerDatasetId, sourcesFor } from "../providers";
import { exnessFileUrl, exnessMonths, parseExnessTicks } from "../providers/exness";
import { chunkFor, fxcmFileUrl, parseFxcmCsv, type FxcmChunk, type ParsedCandles } from "../providers/fxcm";
import { TF_SECONDS } from "../time";
import type { ChunkStatus, ProviderId, Timeframe } from "../types";
import { listZipEntries, pickDataEntry } from "../unzip";
import { createDataset, StoreError, storeProviderChunk } from "./store";

// Server side of the automatic download: get one trading week, validate it
// and store it in the database together with its coverage record. The
// browser drives the loop (one week per request), so a request never runs
// for minutes and an interrupted preparation simply resumes.
//
// Each week is asked from the providers in order (FXCM, then Exness) until
// one has the complete week. Missing, empty, corrupt or truncated FXCM files
// are filled from Exness. A provider that is busy or unreachable is asked
// again on a later attempt; only when every provider is busy does the
// request fail (as retryable).

/** Exness month files are 5–30 MB; FXCM weeks about 100 KB. */
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_UNZIPPED = 768 * 1024 * 1024;
/** Each week has to be stored inside the route's 60 s limit. */
const BUDGET_MS = 50_000;
const FXCM_TIMEOUT_MS = 20_000;
const PROBE_TIMEOUT_MS = 15_000;
const USER_AGENT = "MoblogReplay/1.0 (personal backtesting; stores data in the user's own database)";
const DAY = 86_400;

export type FileFetcher = (
  url: string,
  method: "GET" | "HEAD",
  timeoutMs?: number,
) => Promise<{ status: number; body: Buffer | null; retryAfter: number | null; contentLength: number | null }>;

const defaultFetcher: FileFetcher = async (url, method, timeoutMs = 30_000) => {
  const res = await fetch(url, { method, cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": USER_AGENT } });
  const ra = Number(res.headers.get("retry-after"));
  const lenHeader = res.headers.get("content-length");
  const len = lenHeader === null ? NaN : Number(lenHeader);
  let body: Buffer | null = null;
  if (method === "GET" && res.ok) {
    if (len > MAX_BYTES) throw new StoreError("Provider file unexpectedly large.", 502);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new StoreError("Provider file unexpectedly large.", 502);
    body = Buffer.from(buf);
  }
  return { status: res.status, body, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null, contentLength: Number.isFinite(len) && len >= 0 ? len : null };
};

/** Thrown for "try again later" conditions (rate limits, outages, timeouts). */
export class ProviderBusyError extends StoreError {
  constructor(
    message: string,
    readonly retryAfterSec: number | null,
  ) {
    super(message, 503);
    this.name = "ProviderBusyError";
  }
}

export interface ChunkRef {
  symbol: string;
  resolution: Timeframe;
  year: number;
  week: number;
  fromT: number;
}

function validate(ref: ChunkRef) {
  const symbol = ref.symbol.toUpperCase();
  if (!autoSupports(symbol, ref.resolution)) throw new StoreError(`${symbol} ${ref.resolution} is not available for automatic download.`);
  const thisYear = new Date().getUTCFullYear();
  if (!Number.isInteger(ref.year) || ref.year < AUTO_FIRST_YEAR || ref.year > thisYear) throw new StoreError("Year out of range.");
  if (!Number.isInteger(ref.week) || ref.week < 1 || ref.week > 53) throw new StoreError("Week out of range.");
  const chunk = chunkFor(ref.year, ref.week, ref.fromT);
  if (!chunk) throw new StoreError("Week doesn't match the given date.");
  return { symbol, chunk };
}

// ---------------------------------------------------------------------------
// Asking one provider
// ---------------------------------------------------------------------------

/** What one provider answered for a week. Reasons read after its name: "FXCM has no file for this week". */
interface Answer {
  source: ProviderId;
  /** data: candles for the week · none: nothing usable · busy: try again later */
  outcome: "data" | "none" | "busy";
  reason: string;
  parsed: ParsedCandles | null;
  complete: boolean;
  /** Bytes downloaded for this answer in this request. */
  bytes: number;
  retryAfter: number | null;
}

class SourceBusy extends Error {
  constructor(
    message: string,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }
}

const none = (source: ProviderId, reason: string, bytes = 0): Answer => ({ source, outcome: "none", reason, parsed: null, complete: false, bytes, retryAfter: null });

function withData(source: ProviderId, parsed: ParsedCandles, chunk: FxcmChunk, resolution: Timeframe, bytes: number): Answer {
  const n = parsed.bars.n;
  if (!n) return none(source, "has no candles for this week", bytes);
  const complete = isCompleteWeek(parsed.bars.t, n, chunk, resolution);
  return { source, outcome: "data", reason: complete ? "has the complete week" : `has only ${n.toLocaleString("en-US")} candles for this week`, parsed, complete, bytes, retryAfter: null };
}

async function get(fetcher: FileFetcher, url: string, method: "GET" | "HEAD", timeoutMs: number) {
  if (timeoutMs < 1000) throw new SourceBusy("ran out of time for this request");
  let r: Awaited<ReturnType<FileFetcher>>;
  try {
    r = await fetcher(url, method, timeoutMs);
  } catch (e) {
    if (e instanceof StoreError) throw e;
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new SourceBusy(timeout ? "didn't respond in time" : "couldn't be reached");
  }
  if (r.status === 429) throw new SourceBusy("is rate-limiting requests", r.retryAfter);
  if (r.status >= 500) throw new SourceBusy("had a server error", r.retryAfter);
  return r;
}

async function ask(source: ProviderId, fn: () => Promise<Answer>): Promise<Answer> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SourceBusy) return { source, outcome: "busy", reason: e.message, parsed: null, complete: false, bytes: 0, retryAfter: e.retryAfter };
    if (e instanceof StoreError) return none(source, `failed: ${e.message}`);
    throw e;
  }
}

async function fxcmWeek(fetcher: FileFetcher, symbol: string, resolution: Timeframe, chunk: FxcmChunk, deadline: number): Promise<Answer> {
  const r = await get(fetcher, fxcmFileUrl(symbol, resolution, chunk.year, chunk.week), "GET", Math.min(FXCM_TIMEOUT_MS, deadline - Date.now()));
  if (r.status === 404 || r.status === 403) return none("fxcm", "has no file for this week");
  if (r.status < 200 || r.status >= 300) return none("fxcm", `answered HTTP ${r.status}`);
  const bytes = r.body?.byteLength ?? 0;
  if (!r.body || !bytes) return none("fxcm", "published an empty file for this week");
  let text: string;
  try {
    text = zlib.gunzipSync(r.body).toString("utf8");
  } catch {
    return none("fxcm", "published a corrupt file for this week", bytes);
  }
  try {
    return withData("fxcm", parseFxcmCsv(text, chunk, TF_SECONDS[resolution]), chunk, resolution, bytes);
  } catch {
    return none("fxcm", "published a file in an unexpected format", bytes);
  }
}

// Recently downloaded Exness month files (per fetcher), so the weeks of one
// month download it once on a warm server and concurrent requests share it.
const CACHE_SIZE = 3;
const CACHE_TTL_MS = 10 * 60_000;
const monthCache = new WeakMap<FileFetcher, Map<string, { at: number; zip: Promise<Buffer | null> }>>();

/** One Exness month file, or null when the archive has none (before 2016, not yet published…). */
async function exnessMonth(fetcher: FileFetcher, url: string, deadline: number): Promise<{ zip: Buffer; downloaded: number } | null> {
  let cache = monthCache.get(fetcher);
  if (!cache) monthCache.set(fetcher, (cache = new Map()));
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    const zip = await hit.zip;
    return zip && { zip, downloaded: 0 };
  }
  const zip = get(fetcher, url, "GET", deadline - Date.now()).then((r) => (r.status >= 200 && r.status < 300 && r.body?.byteLength ? r.body : null));
  const entry = { at: Date.now(), zip };
  cache.set(url, entry);
  // Failures aren't cached: the next attempt downloads again.
  zip.catch(() => cache.get(url) === entry && cache.delete(url));
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  const body = await zip;
  return body && { zip: body, downloaded: body.byteLength };
}

/** The tick CSV inside an Exness month archive. */
async function unzipCsv(zip: Buffer): Promise<string> {
  const entry = pickDataEntry(await listZipEntries(new Blob([new Uint8Array(zip)])));
  if (!entry) throw new Error("No CSV in the archive.");
  if (entry.uncompressedSize > MAX_UNZIPPED) throw new Error("Archive too large.");
  const at = entry.localHeaderOffset;
  if (zip.readUInt32LE(at) !== 0x04034b50) throw new Error("Corrupt ZIP entry header.");
  const start = at + 30 + zip.readUInt16LE(at + 26) + zip.readUInt16LE(at + 28);
  const raw = zip.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw.toString("latin1");
  if (entry.method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: MAX_UNZIPPED }).toString("latin1");
  throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
}

async function exnessWeek(fetcher: FileFetcher, symbol: string, resolution: Timeframe, chunk: FxcmChunk, deadline: number): Promise<Answer> {
  const parts: ParsedCandles[] = [];
  let bytes = 0;
  // Trading ends on Friday evening: a week ending on the 1st doesn't need that month's file.
  for (const { year, month } of exnessMonths(chunk.fromT, chunk.fromT + 5 * DAY + 12 * 3600 - 1)) {
    const file = await exnessMonth(fetcher, exnessFileUrl(symbol, year, month), deadline);
    if (!file) continue;
    bytes += file.downloaded;
    let text: string;
    try {
      text = await unzipCsv(file.zip);
    } catch {
      return none("exness", "published a corrupt file for this month", bytes);
    }
    try {
      parts.push(parseExnessTicks(text, chunk, TF_SECONDS[resolution]));
    } catch {
      return none("exness", "published a file in an unexpected format", bytes);
    }
  }
  if (!parts.length) return none("exness", "has no file for this week", bytes);
  // Months are consecutive and each part holds only its month's ticks, so the parts are in order.
  const parsed: ParsedCandles =
    parts.length === 1
      ? parts[0]
      : {
          bars: concatBars(parts.map((p) => p.bars)),
          quality: parts.map((p) => p.quality).reduce(mergeQuality),
          outsideWindow: 0,
          negativeSpread: parts.reduce((s, p) => s + p.negativeSpread, 0),
        };
  return withData("exness", parsed, chunk, resolution, bytes);
}

/** The complete week if a provider had one, otherwise the fullest (earlier providers win near-ties). */
function pickBest(answers: Answer[]): Answer | null {
  let best: Answer | null = null;
  for (const a of answers) {
    if (a.outcome !== "data") continue;
    if (a.complete) return a;
    if (!best || a.parsed!.bars.n > best.parsed!.bars.n * 1.02) best = a;
  }
  return best;
}

type BusyAnswer = Pick<Answer, "source" | "reason" | "retryAfter">;

const describe = (answers: BusyAnswer[]) => answers.map((a) => `${PROVIDERS[a.source].short} ${a.reason}`).join("; ");

function busyError(busy: BusyAnswer[]) {
  const waits = busy.map((a) => a.retryAfter).filter((x): x is number => x !== null);
  return new ProviderBusyError(`${describe(busy)}.`, waits.length ? Math.max(...waits) : null);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Does any provider have this week? (HEAD requests only, nothing stored.) */
export async function probeChunk(ref: ChunkRef, fetcher: FileFetcher = defaultFetcher) {
  const { symbol, chunk } = validate(ref);
  const sources = sourcesFor(symbol, ref.resolution);
  const busy: BusyAnswer[] = [];
  for (const source of sources) {
    const mid = new Date((chunk.fromT + 3 * DAY) * 1000); // the month most of the week is in
    const url = source === "fxcm" ? fxcmFileUrl(symbol, ref.resolution, chunk.year, chunk.week) : exnessFileUrl(symbol, mid.getUTCFullYear(), mid.getUTCMonth() + 1);
    try {
      const r = await get(fetcher, url, "HEAD", PROBE_TIMEOUT_MS);
      // FXCM serves some broken weeks as 0-byte files.
      if (r.status >= 200 && r.status < 300 && r.contentLength !== 0) return { key: chunk.key, status: "ok" as const, bytes: r.contentLength, source };
    } catch (e) {
      if (!(e instanceof SourceBusy)) throw e;
      busy.push({ source, reason: e.message, retryAfter: e.retryAfter });
    }
  }
  if (busy.length === sources.length) throw busyError(busy);
  return { key: chunk.key, status: "missing" as const, bytes: null, source: null };
}

export interface IngestOptions {
  fetcher?: FileFetcher;
  /** Last attempt: store the best week found even while a provider is busy (that provider is asked again next time). */
  final?: boolean;
}

export interface IngestResult {
  key: string;
  status: ChunkStatus;
  /** Provider whose candles were stored, or null when none had the week. */
  source: ProviderId | null;
  candles: number;
  /** Downloaded in this request, from every provider asked. */
  bytes: number;
  added: number;
  rejected: number;
  outsideWindow: number;
  negativeSpread: number;
  /** What the other providers asked answered, e.g. FXCM "has no file for this week". */
  notes: { source: ProviderId; reason: string }[];
}

export async function ingestChunk(ref: ChunkRef, opts: IngestOptions = {}): Promise<IngestResult> {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const { symbol, chunk } = validate(ref);
  const deadline = Date.now() + BUDGET_MS;
  const answers: Answer[] = [];
  for (const source of sourcesFor(symbol, ref.resolution)) {
    const a = await ask(source, () => (source === "fxcm" ? fxcmWeek : exnessWeek)(fetcher, symbol, ref.resolution, chunk, deadline));
    answers.push(a);
    if (a.complete) break;
  }
  const best = pickBest(answers);
  const busy = answers.filter((a) => a.outcome === "busy");
  const answered = answers.filter((a) => a.outcome !== "busy");
  // An incomplete week might still be completed by the busy provider: wait for it, unless this is the last attempt.
  if (busy.length && !best?.complete && (!opts.final || !answered.length)) throw busyError(busy);

  const datasetId = providerDatasetId({ symbol, resolution: ref.resolution });
  await createDataset({
    id: datasetId,
    name: `${symbol} ${ref.resolution} · automatic`,
    symbol,
    timeframe: ref.resolution,
    source: "fxcm",
    kind: "provider",
    priceBasis: "bid",
    sourceTimezone: "UTC",
    hasSpread: true,
    derivedFromTicks: false,
  });
  const status: ChunkStatus = !best ? "missing" : best.complete ? "ok" : "partial";
  const parsed = best?.parsed ?? null;
  const bars = parsed?.bars ?? emptyBars();
  const res = await storeProviderChunk(datasetId, {
    chunk: chunk.key,
    window: chunk,
    status,
    source: best?.source ?? null,
    tried: answered.map((a) => a.source),
    bytes: best?.bytes ?? 0,
    quality: parsed?.quality ?? null,
    bars,
  });
  return {
    key: chunk.key,
    status,
    source: best?.source ?? null,
    candles: bars.n,
    bytes: answers.reduce((s, a) => s + a.bytes, 0),
    added: res.added,
    rejected: parsed ? parsed.quality.malformed + parsed.quality.invalidOhlc : 0,
    outsideWindow: parsed?.outsideWindow ?? 0,
    negativeSpread: parsed?.negativeSpread ?? 0,
    notes: answers.filter((a) => a !== best).map((a) => ({ source: a.source, reason: a.reason })),
  };
}
