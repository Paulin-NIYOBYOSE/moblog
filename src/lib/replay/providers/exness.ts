import { allocBars, sliceBars } from "../bars";
import type { Timeframe } from "../types";
import { emptyQuality, type ParsedCandles } from "./fxcm";

// Exness publishes the tick history of its instruments for free at
// https://www.exness.com/tick-history/ — one zipped CSV per symbol and month:
// https://ticks.ex2archive.com/ticks/{SYMBOL}/{YEAR}/{MM}/Exness_{SYMBOL}_{YEAR}_{MM}.zip
// Every row is one bid/ask quote in UTC:
//   "exness","EURUSD","2026-10-22 23:59:58.502Z",1.12208,1.12214
// Files start in January 2016. The current month's file is rebuilt every day
// (around 01:40 UTC) with everything up to the previous midnight.
//
// Replay builds candles from these ticks for the weeks FXCM's archive lacks.
// A month is 5–13 MB for an FX pair, so it is never the first choice.

export const EXNESS = {
  id: "exness" as const,
  name: "Exness tick history",
  short: "Exness",
  homepage: "https://www.exness.com/tick-history/",
  terms: "Published by Exness as indicative prices for information. Candles are built from its bid/ask ticks and stored only in your own database, never redistributed.",
  firstYear: 2016,
  resolutions: ["M1", "H1"] as Timeframe[],
  /** FXCM's 22 pairs — each checked to exist in the archive (October 2026). */
  instruments: [
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD", "EURJPY", "GBPJPY", "EURGBP",
    "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "CADCHF", "EURAUD", "EURCHF", "GBPCHF", "GBPNZD", "NZDCAD", "NZDCHF", "NZDJPY",
  ],
};

export function exnessFileUrl(symbol: string, year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `https://ticks.ex2archive.com/ticks/${symbol}/${year}/${mm}/Exness_${symbol}_${year}_${mm}.zip`;
}

/** The monthly files (UTC calendar months) that cover [fromT, toT]. */
export function exnessMonths(fromT: number, toT: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  const d = new Date(fromT * 1000);
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth() + 1;
  while (Date.UTC(year, month - 1, 1) / 1000 <= toT) {
    out.push({ year, month });
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return out;
}

const HEADER = '"Exness","Symbol","Timestamp","Bid","Ask"';

const digits = (s: string, from: number, len: number) => {
  let v = 0;
  for (let i = from; i < from + len; i++) {
    const d = s.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return NaN;
    v = v * 10 + d;
  }
  return v;
};

/**
 * Build candles of `periodSec` from one monthly tick file, keeping only ticks
 * inside `window`. Bars hold BID prices; the per-bar spread is the mean of
 * the spreads at its first and last tick (as FXCM's open/close spreads).
 * Malformed rows are rejected and counted, never repaired.
 */
export function parseExnessTicks(text: string, window: { fromT: number; toT: number }, periodSec = 60): ParsedCandles {
  const quality = emptyQuality();
  let pos = text.indexOf("\n");
  if ((pos < 0 ? text : text.slice(0, pos)).replace(/^\uFEFF/, "").trim() !== HEADER) {
    throw new Error("Unexpected Exness file format (header mismatch) — nothing was imported from it.");
  }
  const out = allocBars(Math.max(0, Math.floor((window.toT - window.fromT) / periodSec) + 1), true);
  let n = 0;
  let negativeSpread = 0;
  let bucket = -1;
  let openSpread = 0;
  let closeSpread = 0;
  let prevT = -Infinity;
  let line = 1;
  const bad = (start: number, end: number, reason: string) => {
    quality.malformed++;
    if (quality.malformedExamples.length < 20) quality.malformedExamples.push({ line, text: text.slice(start, Math.min(end, start + 120)), reason });
  };
  const closeBar = () => {
    const sp = (openSpread + closeSpread) / 2;
    out.sp![n - 1] = sp >= 0 ? sp : NaN;
    if (sp < 0) negativeSpread++;
  };
  while (pos >= 0 && pos < text.length) {
    const start = pos + 1;
    pos = text.indexOf("\n", start);
    const end = pos < 0 ? text.length : pos;
    line++;
    if (end - start < 2) continue;
    // Fields: "exness","SYMBOL","YYYY-MM-DD HH:MM:SS.fffZ",bid,ask
    const c0 = text.indexOf(",", start);
    const c1 = c0 < 0 ? -1 : text.indexOf(",", c0 + 1);
    const c2 = c1 < 0 ? -1 : text.indexOf(",", c1 + 1);
    const c3 = c2 < 0 ? -1 : text.indexOf(",", c2 + 1);
    if (c3 < 0 || c3 >= end || text.charCodeAt(c1 + 1) !== 34 || text[c1 + 6] !== "-" || text[c1 + 12] !== " " || text[c1 + 15] !== ":") {
      bad(start, end, "Unrecognised row");
      continue;
    }
    const q = c1 + 2; // first digit of the year
    const t = Date.UTC(digits(text, q, 4), digits(text, q + 5, 2) - 1, digits(text, q + 8, 2), digits(text, q + 11, 2), digits(text, q + 14, 2), digits(text, q + 17, 2)) / 1000;
    const bid = Number(text.slice(c2 + 1, c3));
    const ask = Number(text.slice(c3 + 1, end));
    if (!Number.isFinite(t)) {
      bad(start, end, "Unrecognised timestamp");
      continue;
    }
    if (!(bid > 0) || !(ask > 0) || !Number.isFinite(bid) || !Number.isFinite(ask)) {
      bad(start, end, "Non-numeric or non-positive price");
      continue;
    }
    if (t < window.fromT || t > window.toT) continue;
    quality.rowsRead++;
    if (t < prevT) {
      // The archive is sorted; a stray older tick can't reopen a finished candle.
      quality.outOfOrder++;
      continue;
    }
    prevT = t;
    const b = t - (t % periodSec);
    if (b !== bucket) {
      if (n) closeBar();
      bucket = b;
      out.t[n] = b;
      out.o[n] = out.h[n] = out.l[n] = out.c[n] = bid;
      out.v[n] = 0;
      openSpread = ask - bid;
      n++;
    } else {
      const k = n - 1;
      if (bid > out.h[k]) out.h[k] = bid;
      if (bid < out.l[k]) out.l[k] = bid;
      out.c[k] = bid;
    }
    closeSpread = ask - bid;
  }
  if (n) closeBar();
  return { bars: sliceBars(out, 0, n), quality, outsideWindow: 0, negativeSpread };
}
