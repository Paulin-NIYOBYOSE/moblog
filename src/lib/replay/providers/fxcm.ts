import { allocBars, sliceBars } from "../bars";
import type { Bars, QualityReport, Timeframe } from "../types";

// FXCM publishes historical FX candles for personal use at
// https://candledata.fxcorporate.com/{m1|H1}/{SYMBOL}/{YEAR}/{WEEK}.csv.gz
// (documented in https://github.com/fxcm/MarketData). Files hold one trading
// week (Sunday ~21:00 UTC → Friday ~22:00 UTC) of bid AND ask OHLC in UTC.
//
// Week numbering was verified against 15 real files (2012–2026): a file is
// named after the year of the Sunday that opens the trading week, and the
// week number uses Sunday-start weeks where week 1 is the first week with at
// least four days in that year. Weeks whose Sunday belongs to the previous
// year are filed under that previous year (e.g. Sun 29 Dec 2019 → 2019/53).

export const FXCM = {
  id: "fxcm" as const,
  name: "FXCM historical candles",
  homepage: "https://github.com/fxcm/MarketData",
  terms: "Published by FXCM for personal use under its EULA. Prices are indicative (lowest Active Trader spreads). Stored only in your own database, never redistributed.",
  /** First year with files on the server (2011 and earlier return 404). */
  firstYear: 2012,
  /** The newest files lag real time by roughly one to two weeks. */
  lagDays: 9,
  resolutions: ["M1", "H1"] as Timeframe[],
  instruments: [
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD", "EURJPY", "GBPJPY", "EURGBP",
    "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "CADCHF", "EURAUD", "EURCHF", "GBPCHF", "GBPNZD", "NZDCAD", "NZDCHF", "NZDJPY",
  ],
};

/** One shared dataset per provider, symbol and resolution. */
export function providerDatasetId(req: { provider: "fxcm"; symbol: string; resolution: Timeframe }): string {
  return `${req.provider}_${req.symbol}_${req.resolution}`;
}

/** The weekly file (year/week) that `chunk` claims to be — recomputed, never trusted. */
export function chunkFor(year: number, week: number, fromT: number): FxcmChunk | null {
  const sunday = weekSundayOf(fromT + 12 * 3600);
  const w = fxcmWeekOf(sunday);
  if (w.year !== year || w.week !== week) return null;
  return { key: chunkKey(year, week), year, week, fromT: sunday + 12 * 3600, toT: sunday + 7 * DAY + 12 * 3600 - 1 };
}

export function fxcmFileUrl(symbol: string, resolution: Timeframe, year: number, week: number): string {
  return `https://candledata.fxcorporate.com/${resolution === "H1" ? "H1" : "m1"}/${symbol}/${year}/${week}.csv.gz`;
}

export function fxcmSupports(symbol: string, resolution: Timeframe = "M1"): boolean {
  return FXCM.instruments.includes(symbol) && FXCM.resolutions.includes(resolution);
}

const DAY = 86_400;

/** 00:00 UTC of the Sunday that opens the FX trading week containing `t`. */
export function weekSundayOf(t: number): number {
  // Weeks are split at Sunday 12:00 UTC: Sunday evening belongs to the new week.
  const shifted = t - 12 * 3600;
  const d = new Date(shifted * 1000);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
  return dayStart - d.getUTCDay() * DAY;
}

/** FXCM file name (year, week) for the trading week starting on `sunday` (00:00 UTC). */
export function fxcmWeekOf(sunday: number): { year: number; week: number } {
  const d = new Date(sunday * 1000);
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / 1000;
  const doy = Math.round((sunday - jan1) / DAY) + 1;
  const wd = new Date(jan1 * 1000).getUTCDay();
  const a = wd <= 3 ? wd : wd - 7;
  return { year, week: Math.floor((doy + a) / 7) + 1 };
}

export interface FxcmChunk {
  key: string; // e.g. "2024-W10"
  year: number;
  week: number;
  /** Window of candle open times this file is expected to contain. */
  fromT: number;
  toT: number;
}

export function chunkKey(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** All weekly files needed to cover [fromT, toT]. */
export function planFxcmChunks(fromT: number, toT: number): FxcmChunk[] {
  const out: FxcmChunk[] = [];
  if (!(toT > fromT)) return out;
  for (let sunday = weekSundayOf(fromT); sunday <= toT; sunday += 7 * DAY) {
    const { year, week } = fxcmWeekOf(sunday);
    out.push({ key: chunkKey(year, week), year, week, fromT: sunday + 12 * 3600, toT: sunday + 7 * DAY + 12 * 3600 - 1 });
  }
  return out;
}

/** Latest trading week the archive can reasonably have published by `now`. */
export function latestPublishedSunday(nowSec: number): number {
  return weekSundayOf(nowSec - FXCM.lagDays * DAY);
}

export function fxcmEarliestT(): number {
  return Date.UTC(FXCM.firstYear, 0, 1) / 1000;
}

function emptyQuality(): QualityReport {
  return {
    rowsRead: 0,
    malformed: 0,
    malformedExamples: [],
    invalidOhlc: 0,
    invalidExamples: [],
    duplicates: 0,
    conflictingDuplicates: 0,
    outOfOrder: 0,
    misaligned: 0,
    gapCount: 0,
    largeGaps: [],
    weekendGaps: 0,
  };
}

const HEADER = "DateTime,BidOpen,BidHigh,BidLow,BidClose,AskOpen,AskHigh,AskLow,AskClose";

export interface FxcmParsed {
  bars: Bars;
  quality: QualityReport;
  /** Rows whose timestamp fell outside the file's week window. */
  outsideWindow: number;
  /** Rows where ask < bid (spread recorded as unknown). */
  negativeSpread: number;
}

/**
 * Parse one FXCM weekly CSV ("MM/DD/YYYY HH:mm:ss.fff,bidO,bidH,bidL,bidC,askO,askH,askL,askC").
 * Bars keep BID prices; the per-bar spread is the mean of the open and close
 * bid/ask spreads. Invalid rows are rejected and counted, never repaired.
 */
export function parseFxcmCsv(text: string, chunk?: Pick<FxcmChunk, "fromT" | "toT">, periodSec = 60): FxcmParsed {
  const quality = emptyQuality();
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").replace(/^﻿/, "").trim() !== HEADER) {
    throw new Error("Unexpected FXCM file format (header mismatch) — nothing was imported from it.");
  }
  const out = allocBars(Math.max(0, lines.length - 1), true);
  let n = 0;
  let outsideWindow = 0;
  let negativeSpread = 0;
  let prevT = -Infinity;
  const bad = (kind: "malformed" | "invalid", line: number, text: string, reason: string) => {
    if (kind === "malformed") {
      quality.malformed++;
      if (quality.malformedExamples.length < 20) quality.malformedExamples.push({ line, text: text.slice(0, 120), reason });
    } else {
      quality.invalidOhlc++;
      if (quality.invalidExamples.length < 20) quality.invalidExamples.push({ line, text: text.slice(0, 120), reason });
    }
  };
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    quality.rowsRead++;
    // Fixed-width date: MM/DD/YYYY HH:mm:ss.fff
    if (line.length < 24 || line[2] !== "/" || line[5] !== "/" || line[10] !== " " || line[13] !== ":" || line[23] !== ",") {
      bad("malformed", i + 1, line, "Unrecognised timestamp");
      continue;
    }
    const t =
      Date.UTC(+line.slice(6, 10), +line.slice(0, 2) - 1, +line.slice(3, 5), +line.slice(11, 13), +line.slice(14, 16), +line.slice(17, 19)) / 1000;
    const f = line.slice(24).split(",");
    if (!Number.isFinite(t) || f.length < 8) {
      bad("malformed", i + 1, line, "Wrong number of fields");
      continue;
    }
    const v = f.map(Number);
    if (!v.slice(0, 8).every((x) => Number.isFinite(x) && x > 0)) {
      bad("malformed", i + 1, line, "Non-numeric or non-positive price");
      continue;
    }
    const [bo, bh, bl, bc, ao, ah, al, ac] = v;
    if (bh < bl || bh < bo || bh < bc || bl > bo || bl > bc || ah < al || ah < ao || ah < ac || al > ao || al > ac) {
      bad("invalid", i + 1, line, "High/low inconsistent with open/close");
      continue;
    }
    if (t % periodSec !== 0) quality.misaligned++;
    if (chunk && (t < chunk.fromT || t > chunk.toT)) {
      outsideWindow++;
      continue;
    }
    if (t <= prevT) {
      if (t === prevT) {
        quality.duplicates++;
        continue;
      }
      quality.outOfOrder++;
    }
    const spread = (ao - bo + (ac - bc)) / 2;
    out.t[n] = t;
    out.o[n] = bo;
    out.h[n] = bh;
    out.l[n] = bl;
    out.c[n] = bc;
    out.v[n] = 0;
    out.sp![n] = spread >= 0 ? spread : NaN;
    if (spread < 0) negativeSpread++;
    n++;
    prevT = Math.max(prevT, t);
  }
  let bars = sliceBars(out, 0, n);
  if (quality.outOfOrder) {
    // Rare: sort while keeping file order for ties, then drop duplicates.
    const idx = Array.from({ length: n }, (_, k) => k).sort((a, b) => bars.t[a] - bars.t[b] || a - b);
    const sorted = allocBars(n, true);
    let k = 0;
    for (const j of idx) {
      if (k > 0 && sorted.t[k - 1] === bars.t[j]) {
        quality.duplicates++;
        continue;
      }
      sorted.t[k] = bars.t[j];
      sorted.o[k] = bars.o[j];
      sorted.h[k] = bars.h[j];
      sorted.l[k] = bars.l[j];
      sorted.c[k] = bars.c[j];
      sorted.v[k] = 0;
      sorted.sp![k] = bars.sp![j];
      k++;
    }
    bars = sliceBars(sorted, 0, k);
  }
  return { bars, quality, outsideWindow, negativeSpread };
}
