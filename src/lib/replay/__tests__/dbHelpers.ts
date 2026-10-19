import { gzipSync } from "node:zlib";
import { inject } from "vitest";
import { prisma } from "@/lib/prisma";
import type { FileFetcher } from "../server/fxcmIngest";

export const hasDb = Boolean(inject("testDbUrl"));
export const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;

export async function resetReplayTables() {
  await prisma.$executeRawUnsafe(`TRUNCATE "ReplayJournalEntry", "ReplaySession", "ReplayCandleDay", "ReplayProviderChunk", "ReplayDataset", "ReplayMeta" CASCADE`);
}

/** Synthetic FXCM-format weekly file (test fixture, NOT market data). */
export function fxcmFile(sunday: number, opts: { minutes?: number; badRows?: string[]; price?: (i: number) => number; startHour?: number } = {}) {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const rows = ["DateTime,BidOpen,BidHigh,BidLow,BidClose,AskOpen,AskHigh,AskLow,AskClose"];
  const start = sunday + (opts.startHour ?? 22) * 3600;
  const n = opts.minutes ?? 300;
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

/** In-memory FXCM server for the ingest code: serves synthetic weekly files. */
export function fakeFxcm(opts: { missing?: string[]; failFirst?: Record<string, number>; retryAfter?: Record<string, number>; minutes?: number; price?: (i: number) => number } = {}) {
  const calls: string[] = [];
  const fails = { ...(opts.failFirst ?? {}) };
  const ra = { ...(opts.retryAfter ?? {}) };
  const fetcher: FileFetcher = async (url, method) => {
    const m = url.match(/\/(m1|H1)\/([A-Z]+)\/(\d{4})\/(\d+)\.csv\.gz$/);
    if (!m) throw new Error(`unexpected url ${url}`);
    const key = `${m[3]}-W${m[4].padStart(2, "0")}`;
    calls.push(`${method} ${key}`);
    if (opts.missing?.includes(key)) return { status: 404, body: null, retryAfter: null, contentLength: null };
    if (method === "GET" && ra[key]) {
      const sec = ra[key];
      delete ra[key];
      return { status: 503, body: null, retryAfter: sec, contentLength: null };
    }
    if (method === "GET" && fails[key] > 0) {
      fails[key]--;
      return { status: 503, body: null, retryAfter: null, contentLength: null };
    }
    if (method === "HEAD") return { status: 200, body: null, retryAfter: null, contentLength: 90_000 };
    const year = Number(m[3]);
    const week = Number(m[4]);
    // Recover the Sunday that opens this FXCM week.
    const jan1 = Date.UTC(year, 0, 1) / 1000;
    let sunday = jan1 - new Date(jan1 * 1000).getUTCDay() * 86_400;
    const { fxcmWeekOf } = await import("../providers/fxcm");
    while (true) {
      const w = fxcmWeekOf(sunday);
      if (w.year === year && w.week === week) break;
      sunday += 7 * 86_400;
      if (sunday > jan1 + 380 * 86_400) throw new Error("week not found");
    }
    return { status: 200, body: gzipSync(fxcmFile(sunday, { minutes: opts.minutes, price: opts.price })), retryAfter: null, contentLength: null };
  };
  return { fetcher, calls };
}
