import zlib from "node:zlib";
import { chunkFor, FXCM, fxcmFileUrl, fxcmSupports, parseFxcmCsv, providerDatasetId } from "../providers/fxcm";
import { TF_SECONDS } from "../time";
import type { Timeframe } from "../types";
import { createDataset, StoreError, storeProviderChunk } from "./store";

// Server side of the automatic download: fetch one FXCM weekly file, validate
// it and store it in the database together with its coverage record. The
// browser drives the loop (one week per request), so a request never runs
// for minutes and an interrupted preparation simply resumes.

const MAX_BYTES = 12 * 1024 * 1024;
const USER_AGENT = "MoblogReplay/1.0 (personal backtesting; stores data in the user's own database)";

export type FileFetcher = (url: string, method: "GET" | "HEAD") => Promise<{ status: number; body: Buffer | null; retryAfter: number | null; contentLength: number | null }>;

const defaultFetcher: FileFetcher = async (url, method) => {
  const res = await fetch(url, { method, cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { "User-Agent": USER_AGENT } });
  const ra = Number(res.headers.get("retry-after"));
  const len = Number(res.headers.get("content-length"));
  let body: Buffer | null = null;
  if (method === "GET" && res.ok) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new StoreError("Provider file unexpectedly large.", 502);
    body = Buffer.from(buf);
  }
  return { status: res.status, body, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null, contentLength: Number.isFinite(len) && len > 0 ? len : null };
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
  if (!fxcmSupports(symbol, ref.resolution)) throw new StoreError(`${symbol} ${ref.resolution} is not available from ${FXCM.name}.`);
  const thisYear = new Date().getUTCFullYear();
  if (!Number.isInteger(ref.year) || ref.year < FXCM.firstYear || ref.year > thisYear) throw new StoreError("Year out of range.");
  if (!Number.isInteger(ref.week) || ref.week < 1 || ref.week > 53) throw new StoreError("Week out of range.");
  const chunk = chunkFor(ref.year, ref.week, ref.fromT);
  if (!chunk) throw new StoreError("Week doesn't match the given date.");
  return { symbol, chunk };
}

async function getFile(fetcher: FileFetcher, url: string, method: "GET" | "HEAD") {
  try {
    return await fetcher(url, method);
  } catch (e) {
    if (e instanceof StoreError) throw e;
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ProviderBusyError(timeout ? "FXCM didn't respond in time." : "FXCM couldn't be reached.", null);
  }
}

export async function probeChunk(ref: ChunkRef, fetcher: FileFetcher = defaultFetcher) {
  const { symbol, chunk } = validate(ref);
  const r = await getFile(fetcher, fxcmFileUrl(symbol, ref.resolution, chunk.year, chunk.week), "HEAD");
  if (r.status === 404 || r.status === 403) return { key: chunk.key, status: "missing" as const, bytes: null };
  if (r.status === 429 || r.status >= 500) throw new ProviderBusyError(r.status === 429 ? "FXCM is rate-limiting requests." : "FXCM had a server error.", r.retryAfter);
  if (r.status < 200 || r.status >= 300) throw new StoreError(`FXCM answered ${r.status}.`, 502);
  return { key: chunk.key, status: "ok" as const, bytes: r.contentLength };
}

export interface IngestResult {
  key: string;
  status: "ok" | "empty" | "missing";
  candles: number;
  bytes: number;
  added: number;
  rejected: number;
  outsideWindow: number;
  negativeSpread: number;
}

export async function ingestChunk(ref: ChunkRef, fetcher: FileFetcher = defaultFetcher): Promise<IngestResult> {
  const { symbol, chunk } = validate(ref);
  const datasetId = providerDatasetId({ provider: "fxcm", symbol, resolution: ref.resolution });
  await createDataset({
    id: datasetId,
    name: `${symbol} ${ref.resolution} · FXCM`,
    symbol,
    timeframe: ref.resolution,
    source: "fxcm",
    kind: "provider",
    priceBasis: "bid",
    sourceTimezone: "UTC",
    hasSpread: true,
    derivedFromTicks: false,
  });
  const r = await getFile(fetcher, fxcmFileUrl(symbol, ref.resolution, chunk.year, chunk.week), "GET");
  if (r.status === 404 || r.status === 403) {
    await storeProviderChunk(datasetId, { chunk: chunk.key, status: "missing", bytes: 0, quality: null, bars: { t: new Float64Array(0), o: new Float64Array(0), h: new Float64Array(0), l: new Float64Array(0), c: new Float64Array(0), v: new Float64Array(0), sp: null, n: 0 } });
    return { key: chunk.key, status: "missing", candles: 0, bytes: 0, added: 0, rejected: 0, outsideWindow: 0, negativeSpread: 0 };
  }
  if (r.status === 429 || r.status >= 500) throw new ProviderBusyError(r.status === 429 ? "FXCM is rate-limiting requests." : "FXCM had a server error.", r.retryAfter);
  if (r.status < 200 || r.status >= 300 || !r.body) throw new StoreError(`FXCM answered ${r.status}.`, 502);
  let text: string;
  try {
    text = zlib.gunzipSync(r.body).toString("utf8");
  } catch {
    throw new StoreError(`FXCM file ${chunk.key} is corrupt (not gzip) — nothing was stored.`, 502);
  }
  const parsed = parseFxcmCsv(text, chunk, TF_SECONDS[ref.resolution]);
  const status = parsed.bars.n ? "ok" : "empty";
  const res = await storeProviderChunk(datasetId, { chunk: chunk.key, status, bytes: r.body.byteLength, quality: parsed.quality, bars: parsed.bars });
  return {
    key: chunk.key,
    status,
    candles: parsed.bars.n,
    bytes: r.body.byteLength,
    added: res.added,
    rejected: parsed.quality.malformed + parsed.quality.invalidOhlc,
    outsideWindow: parsed.outsideWindow,
    negativeSpread: parsed.negativeSpread,
  };
}
