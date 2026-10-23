import { crc32, deflateRawSync, gzipSync } from "node:zlib";
import { inject } from "vitest";
import { prisma } from "@/lib/prisma";
import { fxcmWeekOf } from "../providers/fxcm";
import type { FileFetcher } from "../server/ingest";

export const hasDb = Boolean(inject("testDbUrl"));
export const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;

/** Minutes in a full trading week (Sunday 22:00 → Friday 22:00 UTC). */
export const WEEK_MINUTES = 7200;

export async function resetReplayTables() {
  await prisma.$executeRawUnsafe(`TRUNCATE "ReplayJournalEntry", "ReplaySession", "ReplayCandleDay", "ReplayProviderChunk", "ReplayDataset", "ReplayMeta" CASCADE`);
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** Synthetic FXCM-format weekly file (test fixture, NOT market data); a full trading week by default. */
export function fxcmFile(sunday: number, opts: { minutes?: number; badRows?: string[]; price?: (i: number) => number; startHour?: number } = {}) {
  const rows = ["DateTime,BidOpen,BidHigh,BidLow,BidClose,AskOpen,AskHigh,AskLow,AskClose"];
  const start = sunday + (opts.startHour ?? 22) * 3600;
  const n = opts.minutes ?? WEEK_MINUTES;
  const price = opts.price ?? ((i: number) => 1.1 + i * 0.00001);
  for (let i = 0; i < n; i++) {
    const t = start + i * 60;
    const d = new Date(t * 1000);
    const ts = `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00.000`;
    const o = price(i);
    const c = price(i + 1);
    const h = Math.max(o, c) + 0.0001;
    const l = Math.min(o, c) - 0.0001;
    rows.push(`${ts},${o.toFixed(5)},${h.toFixed(5)},${l.toFixed(5)},${c.toFixed(5)},${(o + 0.0001).toFixed(5)},${(h + 0.0001).toFixed(5)},${(l + 0.0001).toFixed(5)},${(c + 0.0001).toFixed(5)}`);
  }
  rows.push(...(opts.badRows ?? []));
  return rows.join("\n");
}

/** Is `t` inside the FX trading week (Sunday 22:00 → Friday 22:00 UTC)? */
function trading(t: number) {
  const d = new Date(t * 1000);
  const dow = d.getUTCDay();
  const h = d.getUTCHours();
  return (dow >= 1 && dow <= 4) || (dow === 0 && h >= 22) || (dow === 5 && h < 22);
}

/** Exness bid of the synthetic tick files — 1.3xxxx, so tests can tell it from FXCM's 1.1xxxx. */
export const exnessPrice = (t: number) => 1.3 + ((t / 60) % 1000) * 0.00001;

/**
 * Synthetic Exness monthly tick file (test fixture, NOT market data): two
 * ticks per trading minute — bid rises 0.2 pip inside the minute, spread 0.6 pip.
 */
export function exnessCsv(symbol: string, year: number, month: number) {
  const rows = ['"Exness","Symbol","Timestamp","Bid","Ask"'];
  const from = Date.UTC(year, month - 1, 1) / 1000;
  const to = Date.UTC(year, month, 1) / 1000;
  for (let t = from; t < to; t += 60) {
    if (!trading(t)) continue;
    const ts = new Date(t * 1000).toISOString().slice(0, 19).replace("T", " ");
    const b = exnessPrice(t);
    rows.push(`"exness","${symbol}","${ts}.050Z",${b.toFixed(5)},${(b + 0.00006).toFixed(5)}`);
    rows.push(`"exness","${symbol}","${ts.slice(0, 17)}40.700Z",${(b + 0.00002).toFixed(5)},${(b + 0.00008).toFixed(5)}`);
  }
  return rows.join("\n");
}

/** A one-file ZIP archive (deflate), as Exness serves its month files. */
export function zipOf(name: string, content: string): Buffer {
  const data = Buffer.from(content, "latin1");
  const comp = deflateRawSync(data);
  const fileName = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(local.length + fileName.length + comp.length, 16);
  return Buffer.concat([local, fileName, comp, central, fileName, end]);
}

export interface FakeProviders {
  /** FXCM weeks (e.g. "2024-W11") answering 404. */
  missing?: string[];
  /** FXCM weeks served as a 0-byte file (as 2024-W51 really is). */
  emptyFile?: string[];
  /** FXCM weeks served as bytes that aren't gzip. */
  corrupt?: string[];
  /** FXCM weeks cut off after this many minutes (as 2025-W26 really is). */
  truncated?: Record<string, number>;
  /** FXCM weeks answering 503 this many times first. */
  failFirst?: Record<string, number>;
  /** FXCM weeks answering 503 with Retry-After (seconds) once. */
  retryAfter?: Record<string, number>;
  minutes?: number;
  price?: (i: number) => number;
  exness?: {
    /** Months (e.g. "2024-03") with no file. */
    missingMonths?: string[];
    /** Every request answers 503. */
    down?: boolean;
  };
}

/**
 * In-memory FXCM and Exness servers for the ingest code. Calls are recorded
 * as "GET 2024-W11" (FXCM) and "EXNESS GET 2024-03".
 */
export function fakeProviders(opts: FakeProviders = {}) {
  const calls: string[] = [];
  const fails = { ...(opts.failFirst ?? {}) };
  const ra = { ...(opts.retryAfter ?? {}) };
  const zips = new Map<string, Buffer>();
  const ok = (body: Buffer | null, contentLength: number | null = null) => ({ status: 200, body, retryAfter: null, contentLength });
  const status = (code: number, retryAfter: number | null = null) => ({ status: code, body: null, retryAfter, contentLength: null });

  const exness = (method: string, symbol: string, year: number, month: number) => {
    const key = `${year}-${p2(month)}`;
    calls.push(`EXNESS ${method} ${key}`);
    if (opts.exness?.down) return status(503);
    if (opts.exness?.missingMonths?.includes(key)) return status(404);
    let zip = zips.get(key);
    if (!zip) zips.set(key, (zip = zipOf(`Exness_${symbol}_${year}_${p2(month)}.csv`, exnessCsv(symbol, year, month))));
    return method === "HEAD" ? ok(null, zip.length) : ok(zip);
  };

  const fetcher: FileFetcher = async (url, method) => {
    const ex = url.match(/\/ticks\/([A-Z]+)\/(\d{4})\/(\d{2})\/Exness_[A-Z]+_\d{4}_\d{2}\.zip$/);
    if (ex) return exness(method, ex[1], Number(ex[2]), Number(ex[3]));
    const m = url.match(/\/(m1|H1)\/([A-Z]+)\/(\d{4})\/(\d+)\.csv\.gz$/);
    if (!m) throw new Error(`unexpected url ${url}`);
    const key = `${m[3]}-W${m[4].padStart(2, "0")}`;
    calls.push(`${method} ${key}`);
    if (opts.missing?.includes(key)) return status(404);
    if (opts.emptyFile?.includes(key)) return ok(method === "GET" ? Buffer.alloc(0) : null, 0);
    if (method === "GET" && ra[key]) {
      const sec = ra[key];
      delete ra[key];
      return status(503, sec);
    }
    if (method === "GET" && fails[key] > 0) {
      fails[key]--;
      return status(503);
    }
    if (method === "HEAD") return ok(null, 90_000);
    if (opts.corrupt?.includes(key)) return ok(Buffer.from("<html>not a gzip file</html>"));
    const year = Number(m[3]);
    const week = Number(m[4]);
    // Recover the Sunday that opens this FXCM week.
    const jan1 = Date.UTC(year, 0, 1) / 1000;
    let sunday = jan1 - new Date(jan1 * 1000).getUTCDay() * 86_400;
    while (true) {
      const w = fxcmWeekOf(sunday);
      if (w.year === year && w.week === week) break;
      sunday += 7 * 86_400;
      if (sunday > jan1 + 380 * 86_400) throw new Error("week not found");
    }
    const minutes = opts.truncated?.[key] ?? opts.minutes;
    return ok(gzipSync(fxcmFile(sunday, { minutes, price: opts.price })));
  };
  return { fetcher, calls };
}
