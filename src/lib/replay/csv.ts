import { allocBars, sliceBars } from "./bars";
import { normalizeSymbol, symbolFromText } from "./instruments";
import { isWeekendGap, NY_PLUS_7, TF_SECONDS, timeframeFromSeconds, wallToUtc } from "./time";
import type { Bars, GapInfo, PriceBasis, QualityReport, SourcePreset, Timeframe } from "./types";

// ---------------------------------------------------------------------------
// Configuration produced by detection and edited in the import wizard
// ---------------------------------------------------------------------------

export type ColumnRole =
  | "ignore"
  | "datetime"
  | "date"
  | "time"
  | "open"
  | "high"
  | "low"
  | "close"
  | "volume"
  | "bid"
  | "ask"
  | "price"
  | "spread-points"
  | "symbol";

export const COLUMN_ROLES: { value: ColumnRole; label: string }[] = [
  { value: "ignore", label: "Ignore" },
  { value: "datetime", label: "Date + time" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "open", label: "Open" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "close", label: "Close" },
  { value: "volume", label: "Volume" },
  { value: "bid", label: "Bid (tick)" },
  { value: "ask", label: "Ask (tick)" },
  { value: "price", label: "Price (tick)" },
  { value: "spread-points", label: "Spread (points)" },
  { value: "symbol", label: "Symbol" },
];

export type TsFormat = "compact" | "ymd" | "dmy" | "mdy" | "unix-s" | "unix-ms";

export const TS_FORMATS: { value: TsFormat; label: string; example: string }[] = [
  { value: "compact", label: "YYYYMMDD HHMMSS", example: "20240102 000000" },
  { value: "ymd", label: "YYYY-MM-DD HH:MM[:SS]", example: "2024.01.02 00:00" },
  { value: "dmy", label: "DD.MM.YYYY HH:MM[:SS]", example: "02.01.2024 00:00:00.000" },
  { value: "mdy", label: "MM/DD/YYYY HH:MM[:SS]", example: "01/02/2024 00:00" },
  { value: "unix-s", label: "Unix seconds", example: "1704153600" },
  { value: "unix-ms", label: "Unix milliseconds", example: "1704153600000" },
];

export interface ImportConfig {
  delimiter: string;
  hasHeader: boolean;
  decimalComma: boolean;
  columns: ColumnRole[];
  tsFormat: TsFormat;
  timezone: string;
  kind: "bars" | "ticks";
  priceBasis: PriceBasis;
  symbol: string;
  preset: SourcePreset;
  /** Price value of one MT "point" for spread-in-points columns. */
  pointSize: number;
}

export interface Detection {
  config: ImportConfig;
  headers: string[];
  sample: string[][];
  warnings: string[];
  presetLabel: string;
  timeframeHint: Timeframe | null;
}

export const PRESET_LABEL: Record<SourcePreset, string> = {
  "histdata-ascii": "HistData — Generic ASCII M1",
  "histdata-ascii-tick": "HistData — Generic ASCII tick",
  "histdata-mt": "HistData — MetaTrader M1",
  "histdata-metastock": "HistData — MetaStock M1",
  "histdata-nt-tick": "HistData — NinjaTrader tick",
  dukascopy: "Dukascopy — candles CSV",
  "dukascopy-tick": "Dukascopy — ticks CSV",
  metatrader: "MetaTrader export",
  generic: "Generic CSV",
  fxcm: "FXCM historical candles (automatic)",
};

// ---------------------------------------------------------------------------
// Low-level parsing
// ---------------------------------------------------------------------------

export function splitLine(line: string, delimiter: string): string[] {
  if (!line.includes('"')) return line.split(delimiter).map((s) => s.trim());
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function detectDelimiter(lines: string[]): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const counts = lines.slice(0, 20).map((l) => splitLine(l, d).length);
    if (!counts.length) continue;
    const first = counts[0];
    const consistent = counts.every((c) => c === first);
    const score = first > 1 ? first * (consistent ? 10 : 1) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

const TIME_PART = String.raw`(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?`;
const OFFSET_PART = String.raw`\s*(Z|UTC|GMT(?:[+-]\d{2}:?\d{2})?|[+-]\d{2}:?\d{2})?`;
const RE_COMPACT = /^(\d{4})(\d{2})(\d{2})(?:[ T]?(\d{2})(\d{2})(\d{2})?(\d{1,3})?)?$/;
const RE_YMD = new RegExp(String.raw`^(\d{4})[-./](\d{1,2})[-./](\d{1,2})${TIME_PART}${OFFSET_PART}$`, "i");
const RE_DMY = new RegExp(String.raw`^(\d{1,2})[-./](\d{1,2})[-./](\d{4})${TIME_PART}${OFFSET_PART}$`, "i");

function parseOffset(s: string | undefined): number | null {
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "Z" || u === "UTC" || u === "GMT") return 0;
  const m = u.match(/([+-])(\d{2}):?(\d{2})/);
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
}

function wall(y: number, mo: number, d: number, hh: number, mi: number, ss: number, ms: number): number | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59 || ss > 60) return null;
  const v = Date.UTC(y, mo - 1, d, hh, mi, ss) / 1000 + ms / 1000;
  return Number.isFinite(v) ? v : null;
}

function fracMs(s: string | undefined): number {
  if (!s) return 0;
  return Number((s + "00").slice(0, 3));
}

/** Parse a timestamp string to UTC seconds, or null if it doesn't match. */
export function parseTimestamp(raw: string, format: TsFormat, tz: string): number | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  if (!s) return null;
  let w: number | null = null;
  let embedded: number | null = null;
  switch (format) {
    case "unix-s": {
      const n = Number(s);
      return Number.isFinite(n) && n > 1e8 && n < 1e10 ? n : null;
    }
    case "unix-ms": {
      const n = Number(s);
      return Number.isFinite(n) && n > 1e11 && n < 1e13 ? n / 1000 : null;
    }
    case "compact": {
      const m = s.match(RE_COMPACT);
      if (!m) return null;
      w = wall(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0, m[7] ? Number(m[7].padEnd(3, "0")) : 0);
      break;
    }
    case "ymd": {
      const m = s.match(RE_YMD);
      if (!m) return null;
      w = wall(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0, fracMs(m[7]));
      embedded = parseOffset(m[8]);
      break;
    }
    case "dmy":
    case "mdy": {
      const m = s.match(RE_DMY);
      if (!m) return null;
      const a = +m[1];
      const b = +m[2];
      const [d, mo] = format === "dmy" ? [a, b] : [b, a];
      w = wall(+m[3], mo, d, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0, fracMs(m[7]));
      embedded = parseOffset(m[8]);
      break;
    }
  }
  if (w === null) return null;
  if (embedded !== null) return w - embedded;
  return wallToUtc(w, tz);
}

/** Guess a timestamp format from sample values; reports DD/MM ambiguity. */
export function detectTsFormat(samples: string[]): { format: TsFormat | null; ambiguous: boolean } {
  const vals = samples.map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  if (!vals.length) return { format: null, ambiguous: false };
  const all = (re: RegExp) => vals.filter((v) => re.test(v)).length / vals.length >= 0.8;
  if (all(/^\d{9,10}(\.\d+)?$/)) return { format: "unix-s", ambiguous: false };
  if (all(/^\d{13}$/)) return { format: "unix-ms", ambiguous: false };
  if (all(RE_COMPACT)) return { format: "compact", ambiguous: false };
  if (all(RE_YMD)) return { format: "ymd", ambiguous: false };
  if (all(RE_DMY)) {
    let firstOver12 = false;
    let secondOver12 = false;
    for (const v of vals) {
      const m = v.match(RE_DMY);
      if (!m) continue;
      if (+m[1] > 12) firstOver12 = true;
      if (+m[2] > 12) secondOver12 = true;
    }
    if (firstOver12 && !secondOver12) return { format: "dmy", ambiguous: false };
    if (secondOver12 && !firstOver12) return { format: "mdy", ambiguous: false };
    // Dots are the European (Dukascopy) convention, slashes usually US.
    const dotted = vals[0].includes(".");
    return { format: dotted ? "dmy" : "mdy", ambiguous: true };
  }
  return { format: null, ambiguous: false };
}

function parseNumber(raw: string, decimalComma: boolean): number {
  if (raw === undefined) return NaN;
  let s = raw.trim();
  if (s.startsWith('"')) s = s.replace(/^"|"$/g, "");
  if (decimalComma) s = s.replace(",", ".");
  if (s === "") return NaN;
  return Number(s);
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const HEADER_SYNONYMS: [RegExp, ColumnRole][] = [
  [/^(gmt time|local time|datetime|date ?time|date_time|timestamp|time ?stamp|time \(utc\)|time_utc|dt)$/, "datetime"],
  [/^(date|day)$/, "date"],
  [/^(time|hour)$/, "time"],
  [/^(open|o|open price|bid open|openbid|open_bid)$/, "open"],
  [/^(high|h|high price|bid high|highbid|high_bid|max)$/, "high"],
  [/^(low|l|low price|bid low|lowbid|low_bid|min)$/, "low"],
  [/^(close|c|close price|bid close|closebid|close_bid|last)$/, "close"],
  [/^(volume|vol|tickvol|tick ?volume|tickvolume|real ?volume|volume_ticks)$/, "volume"],
  [/^(bid|bid price|bidprice)$/, "bid"],
  [/^(ask|ask price|askprice|offer)$/, "ask"],
  [/^(spread)$/, "spread-points"],
  [/^(symbol|ticker|instrument|pair)$/, "symbol"],
];

function roleFromHeader(h: string): ColumnRole {
  const k = h.toLowerCase().replace(/[<>"]/g, "").trim();
  for (const [re, role] of HEADER_SYNONYMS) if (re.test(k)) return role;
  return "ignore";
}

function looksNumeric(s: string): boolean {
  return /^-?\d+([.,]\d+)?([eE][-+]?\d+)?$/.test(s.trim().replace(/^"|"$/g, ""));
}

/** True when at least 80% of the (non-empty) sample values satisfy `test` — tolerates a few bad rows. */
function mostly(values: string[], test: (v: string) => boolean): boolean {
  const vals = values.filter((v) => v !== undefined && v !== "");
  if (!vals.length) return false;
  return vals.filter(test).length / vals.length >= 0.8;
}

function timeframeFromName(name: string): Timeframe | null {
  const u = name.toUpperCase();
  const duka = u.match(/_(\d+)_(M|MIN|HOUR|H|D|DAY|W|WEEK)_/);
  if (duka) {
    const n = Number(duka[1]);
    const unit = duka[2];
    const sec = unit.startsWith("M") ? n * 60 : unit.startsWith("H") ? n * 3600 : unit.startsWith("D") ? n * 86400 : n * 604800;
    return timeframeFromSeconds(sec);
  }
  const m = u.match(/(?:^|[_\-. ])(M1|M5|M15|M30|H1|H4|D1|W1)(?:[_\-. ]|$)/);
  return m ? (m[1] as Timeframe) : null;
}

function basisFromName(name: string): PriceBasis | null {
  const u = name.toUpperCase();
  if (/(^|[_\-. ])BID([_\-. ]|$)/.test(u)) return "bid";
  if (/(^|[_\-. ])ASK([_\-. ]|$)/.test(u)) return "ask";
  if (/(^|[_\-. ])(MID|MIDPOINT)([_\-. ]|$)/.test(u)) return "mid";
  return null;
}

/**
 * Inspect a file name and its first lines and propose an import config.
 * The result is a starting point: every field can be changed in the wizard.
 */
export function detectFormat(fileName: string, headText: string): Detection {
  const lines = headText.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 60);
  const warnings: string[] = [];
  const symbol = symbolFromText(fileName) ?? "";
  const tfHint = timeframeFromName(fileName);
  const nameBasis = basisFromName(fileName);
  const delimiter = detectDelimiter(lines);
  const rows = lines.map((l) => splitLine(l, delimiter));
  const first = rows[0] ?? [];
  // A header row has a text field where the next row has a number or date.
  const second = rows[1] ?? [];
  const isValueLike = (f: string) => looksNumeric(f) || RE_DMY.test(f.replace(/^"|"$/g, "")) || RE_YMD.test(f.replace(/^"|"$/g, "")) || RE_COMPACT.test(f);
  const hasHeader =
    rows.length > 1 &&
    first.some((f, i) => /[a-z]/i.test(f) && !isValueLike(f) && second[i] !== undefined && isValueLike(second[i]));
  const headers = hasHeader ? first.map((h) => h.replace(/[<>"]/g, "").trim()) : first.map((_, i) => `Column ${i + 1}`);
  const data = hasHeader ? rows.slice(1) : rows;
  const sample = data.slice(0, 12);
  const ncol = first.length;
  const firstVals = data.map((r) => r[0] ?? "");
  const secondVals = data.map((r) => r[1] ?? "");
  const decimalComma = delimiter !== "," && data.slice(0, 5).some((r) => r.slice(1).some((v) => /^\d+,\d+$/.test(v)));

  const base: ImportConfig = {
    delimiter,
    hasHeader,
    decimalComma,
    columns: new Array(ncol).fill("ignore"),
    tsFormat: "ymd",
    timezone: "UTC",
    kind: "bars",
    priceBasis: nameBasis ?? "unknown",
    symbol,
    preset: "generic",
    pointSize: 0.00001,
  };

  const done = (config: ImportConfig, label?: string): Detection => ({
    config,
    headers,
    sample,
    warnings,
    presetLabel: label ?? PRESET_LABEL[config.preset],
    timeframeHint: tfHint,
  });

  if (!hasHeader) {
    // HistData Generic ASCII M1 / NinjaTrader M1: 20120201 000000;o;h;l;c;v
    if (delimiter === ";" && ncol >= 5 && mostly(firstVals, (v) => /^\d{8} \d{6}$/.test(v))) {
      if (ncol >= 5 && ncol <= 6) {
        return done({
          ...base,
          columns: ["datetime", "open", "high", "low", "close", "volume"].slice(0, ncol) as ColumnRole[],
          tsFormat: "compact",
          timezone: "Etc/GMT+5",
          priceBasis: "bid",
          preset: "histdata-ascii",
        });
      }
    }
    // HistData NinjaTrader tick: 20120201 000000;price;volume
    if (delimiter === ";" && ncol === 3 && mostly(firstVals, (v) => /^\d{8} \d{6}$/.test(v))) {
      const b = nameBasis ?? (/_ASK_/i.test(fileName) ? "ask" : /_LAST_/i.test(fileName) ? "unknown" : "bid");
      return done({
        ...base,
        columns: ["datetime", "price", "volume"],
        tsFormat: "compact",
        timezone: "Etc/GMT+5",
        kind: "ticks",
        priceBasis: b,
        preset: "histdata-nt-tick",
      });
    }
    // HistData Generic ASCII tick: 20120201 000003660,bid,ask,vol
    if (delimiter === "," && ncol >= 3 && mostly(firstVals, (v) => /^\d{8} \d{9}$/.test(v))) {
      return done({
        ...base,
        columns: ["datetime", "bid", "ask", "volume"].slice(0, ncol) as ColumnRole[],
        tsFormat: "compact",
        timezone: "Etc/GMT+5",
        kind: "ticks",
        priceBasis: "bid",
        preset: "histdata-ascii-tick",
      });
    }
    // HistData MetaTrader: 2012.02.01,00:00,o,h,l,c,v
    if (ncol >= 6 && mostly(firstVals, (v) => /^\d{4}\.\d{2}\.\d{2}$/.test(v)) && mostly(secondVals, (v) => /^\d{2}:\d{2}(:\d{2})?$/.test(v))) {
      const histdata = /DAT_MT_/i.test(fileName);
      return done({
        ...base,
        columns: ["date", "time", "open", "high", "low", "close", "volume"].slice(0, ncol) as ColumnRole[],
        tsFormat: "ymd",
        timezone: histdata ? "Etc/GMT+5" : NY_PLUS_7,
        priceBasis: histdata ? "bid" : nameBasis ?? "bid",
        preset: histdata ? "histdata-mt" : "metatrader",
      });
    }
    // HistData MetaStock: EURUSD,201202010000,o,h,l,c,v
    if (ncol >= 6 && mostly(firstVals, (v) => /^[A-Z]{6}$/i.test(v)) && mostly(secondVals, (v) => /^\d{12}$/.test(v))) {
      return done({
        ...base,
        columns: ["symbol", "datetime", "open", "high", "low", "close", "volume"].slice(0, ncol) as ColumnRole[],
        tsFormat: "compact",
        timezone: "Etc/GMT+5",
        priceBasis: "bid",
        symbol: base.symbol || normalizeSymbol(firstVals[0] ?? ""),
        preset: "histdata-metastock",
      });
    }
    // Generic headerless: guess by content.
    const ts1 = detectTsFormat(firstVals.slice(0, 20));
    const ts2 = detectTsFormat(firstVals.slice(0, 20).map((v, i) => `${v} ${secondVals[i] ?? ""}`));
    if (ts1.format && ncol >= 5) {
      if (ts1.ambiguous) warnings.push("Day/month order is ambiguous in the sample — check the timestamp format.");
      return done({ ...base, columns: ["datetime", "open", "high", "low", "close", "volume"].concat(new Array(Math.max(0, ncol - 6)).fill("ignore")).slice(0, ncol) as ColumnRole[], tsFormat: ts1.format });
    }
    if (ts1.format && (ncol === 3 || ncol === 4)) {
      return done({ ...base, columns: ["datetime", "bid", "ask", "volume"].slice(0, ncol) as ColumnRole[], tsFormat: ts1.format, kind: "ticks", priceBasis: "bid" });
    }
    if (ts2.format && ncol >= 6) {
      return done({ ...base, columns: ["date", "time", "open", "high", "low", "close", "volume"].concat(new Array(Math.max(0, ncol - 7)).fill("ignore")).slice(0, ncol) as ColumnRole[], tsFormat: ts2.format });
    }
    warnings.push("Couldn't recognise this layout — map the columns manually.");
    return done(base);
  }

  // Header present: map by column names.
  const columns = headers.map(roleFromHeader);
  const hasDate = columns.includes("date");
  // A lone "time" column (no separate date) holds the full timestamp.
  if (!hasDate) {
    const ti = columns.indexOf("time");
    if (ti >= 0) columns[ti] = "datetime";
  }
  const lower = headers.map((h) => h.toLowerCase());
  const isDuka = lower[0] === "gmt time" || lower[0] === "local time";
  const isTick = columns.includes("bid") && columns.includes("ask") && !columns.includes("open");
  const isMt = headers.some((h) => /^(TICKVOL|VOL|SPREAD)$/i.test(h)) && /^<?DATE>?$/i.test(first[0] ?? "");

  const dtIdx = columns.indexOf("datetime");
  const dateIdx = columns.indexOf("date");
  const timeIdx = columns.indexOf("time");
  const tsSamples = data.slice(0, 30).map((r) => (dtIdx >= 0 ? r[dtIdx] : `${r[dateIdx] ?? ""} ${timeIdx >= 0 ? r[timeIdx] ?? "" : ""}`.trim()));
  const ts = detectTsFormat(tsSamples);
  if (ts.ambiguous) warnings.push("Day/month order is ambiguous in the sample — check the timestamp format.");
  if (!ts.format) warnings.push("Timestamp format not recognised — choose it manually.");
  if (lower[0] === "local time") warnings.push("Dukascopy “Local time” exports embed a GMT offset per row; it is applied automatically.");

  let preset: SourcePreset = "generic";
  if (isDuka) preset = isTick ? "dukascopy-tick" : "dukascopy";
  else if (isMt) preset = "metatrader";

  const config: ImportConfig = {
    ...base,
    columns,
    tsFormat: ts.format ?? "ymd",
    timezone: isMt ? NY_PLUS_7 : "UTC",
    kind: isTick ? "ticks" : "bars",
    priceBasis: nameBasis ?? (isTick ? "bid" : "unknown"),
    preset,
  };
  if (isMt) warnings.push("MetaTrader exports use your broker's server time — confirm the source time zone.");
  if (config.priceBasis === "unknown" && !isTick) {
    warnings.push("Price basis (bid/ask/mid) can't be inferred from this file — pick it before importing.");
  }
  if (!columns.includes("close") && !isTick && !columns.includes("price")) {
    warnings.push("No close column detected — map the OHLC columns manually.");
  }
  return done(config);
}

// ---------------------------------------------------------------------------
// Streaming accumulation
// ---------------------------------------------------------------------------

class Grow {
  buf: Float64Array;
  n = 0;
  constructor(cap = 1 << 16) {
    this.buf = new Float64Array(cap);
  }
  push(v: number) {
    if (this.n === this.buf.length) {
      const next = new Float64Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.n++] = v;
  }
}

interface TickAgg {
  firstT: number;
  lastT: number;
  o: number;
  h: number;
  l: number;
  c: number;
  count: number;
  spreadSum: number;
  spreadN: number;
}

export interface ParsedImport {
  bars: Bars;
  quality: QualityReport;
  timeframe: Timeframe | null;
  detectedSeconds: number | null;
  priceBasis: PriceBasis;
  hasSpread: boolean;
  derivedFromTicks: boolean;
  firstT: number;
  lastT: number;
}

const MAX_EXAMPLES = 20;

export class ImportAccumulator {
  private cfg: ImportConfig;
  private idx: Record<ColumnRole, number>;
  private t = new Grow();
  private o = new Grow();
  private h = new Grow();
  private l = new Grow();
  private c = new Grow();
  private v = new Grow();
  private sp = new Grow();
  private anySpread = false;
  private ticks = new Map<number, TickAgg>();
  private lineNo = 0;
  private headerSkipped = false;
  readonly quality: QualityReport = {
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

  constructor(cfg: ImportConfig) {
    this.cfg = cfg;
    const idx = {} as Record<ColumnRole, number>;
    for (const r of COLUMN_ROLES) idx[r.value] = cfg.columns.indexOf(r.value);
    this.idx = idx;
  }

  /** Validate the mapping before streaming the whole file. */
  static validateConfig(cfg: ImportConfig): string[] {
    const errs: string[] = [];
    const has = (r: ColumnRole) => cfg.columns.includes(r);
    if (!has("datetime") && !has("date")) errs.push("Map a Date + time column (or separate Date and Time columns).");
    if (cfg.kind === "bars") {
      for (const r of ["open", "high", "low", "close"] as ColumnRole[]) if (!has(r)) errs.push(`Map the ${r} column.`);
    } else if (!has("bid") && !has("ask") && !has("price")) {
      errs.push("Tick imports need a Bid, Ask or Price column.");
    }
    if (!cfg.symbol) errs.push("Choose the instrument symbol.");
    return errs;
  }

  private bad(kind: "malformed" | "invalid", text: string, reason: string) {
    if (kind === "malformed") {
      this.quality.malformed++;
      if (this.quality.malformedExamples.length < MAX_EXAMPLES) this.quality.malformedExamples.push({ line: this.lineNo, text: text.slice(0, 160), reason });
    } else {
      this.quality.invalidOhlc++;
      if (this.quality.invalidExamples.length < MAX_EXAMPLES) this.quality.invalidExamples.push({ line: this.lineNo, text: text.slice(0, 160), reason });
    }
  }

  pushLine(line: string) {
    this.lineNo++;
    if (!line || !line.trim()) return;
    if (this.cfg.hasHeader && !this.headerSkipped) {
      this.headerSkipped = true;
      return;
    }
    this.quality.rowsRead++;
    const f = splitLine(line, this.cfg.delimiter);
    const { idx, cfg } = this;
    const tsRaw = idx.datetime >= 0 ? f[idx.datetime] : `${f[idx.date] ?? ""}${idx.time >= 0 ? " " + (f[idx.time] ?? "") : ""}`;
    if (tsRaw === undefined) {
      this.bad("malformed", line, "Missing timestamp column");
      return;
    }
    const t = parseTimestamp(tsRaw, cfg.tsFormat, cfg.timezone);
    if (t === null) {
      this.bad("malformed", line, `Unrecognised timestamp “${tsRaw.slice(0, 40)}”`);
      return;
    }
    const num = (role: ColumnRole) => (idx[role] >= 0 ? parseNumber(f[idx[role]], cfg.decimalComma) : NaN);

    if (cfg.kind === "ticks") {
      const bid = num("bid");
      const ask = num("ask");
      const price = num("price");
      let p: number;
      let spread = NaN;
      if (Number.isFinite(bid) && Number.isFinite(ask)) {
        if (cfg.priceBasis === "mid") p = (bid + ask) / 2;
        else if (cfg.priceBasis === "ask") p = ask;
        else p = bid;
        spread = ask - bid;
      } else if (Number.isFinite(bid)) p = bid;
      else if (Number.isFinite(ask)) p = ask;
      else p = price;
      if (!Number.isFinite(p)) {
        this.bad("malformed", line, "Non-numeric price");
        return;
      }
      if (p <= 0 || (Number.isFinite(spread) && spread < 0)) {
        this.bad("invalid", line, p <= 0 ? "Non-positive price" : "Ask below bid");
        return;
      }
      const minute = Math.floor(t / 60) * 60;
      const agg = this.ticks.get(minute);
      if (!agg) {
        this.ticks.set(minute, {
          firstT: t,
          lastT: t,
          o: p,
          h: p,
          l: p,
          c: p,
          count: 1,
          spreadSum: Number.isFinite(spread) ? spread : 0,
          spreadN: Number.isFinite(spread) ? 1 : 0,
        });
      } else {
        if (t < agg.lastT) this.quality.outOfOrder++;
        if (t < agg.firstT) {
          agg.firstT = t;
          agg.o = p;
        }
        if (t >= agg.lastT) {
          agg.lastT = t;
          agg.c = p;
        }
        if (p > agg.h) agg.h = p;
        if (p < agg.l) agg.l = p;
        agg.count++;
        if (Number.isFinite(spread)) {
          agg.spreadSum += spread;
          agg.spreadN++;
        }
      }
      return;
    }

    const o = num("open");
    const h = num("high");
    const l = num("low");
    const c = num("close");
    if (![o, h, l, c].every(Number.isFinite)) {
      this.bad("malformed", line, "Non-numeric OHLC value");
      return;
    }
    if (o <= 0 || h <= 0 || l <= 0 || c <= 0) {
      this.bad("invalid", line, "Non-positive price");
      return;
    }
    if (h < l || h < o || h < c || l > o || l > c) {
      this.bad("invalid", line, "High/low inconsistent with open/close");
      return;
    }
    const vol = num("volume");
    const spPts = num("spread-points");
    this.t.push(Math.round(t));
    this.o.push(o);
    this.h.push(h);
    this.l.push(l);
    this.c.push(c);
    this.v.push(Number.isFinite(vol) ? vol : 0);
    if (Number.isFinite(spPts) && spPts >= 0) {
      this.sp.push(spPts * cfg.pointSize);
      this.anySpread = true;
    } else this.sp.push(NaN);
  }

  finish(): ParsedImport {
    let n: number;
    let tArr: Float64Array, oArr: Float64Array, hArr: Float64Array, lArr: Float64Array, cArr: Float64Array, vArr: Float64Array;
    let spArr: Float64Array | null;
    const fromTicks = this.cfg.kind === "ticks";
    if (fromTicks) {
      const keys = Array.from(this.ticks.keys()).sort((a, b) => a - b);
      n = keys.length;
      tArr = new Float64Array(n);
      oArr = new Float64Array(n);
      hArr = new Float64Array(n);
      lArr = new Float64Array(n);
      cArr = new Float64Array(n);
      vArr = new Float64Array(n);
      spArr = new Float64Array(n);
      let anySpread = false;
      keys.forEach((k, i) => {
        const a = this.ticks.get(k)!;
        tArr[i] = k;
        oArr[i] = a.o;
        hArr[i] = a.h;
        lArr[i] = a.l;
        cArr[i] = a.c;
        vArr[i] = a.count;
        spArr![i] = a.spreadN ? a.spreadSum / a.spreadN : NaN;
        if (a.spreadN) anySpread = true;
      });
      if (!anySpread) spArr = null;
    } else {
      n = this.t.n;
      tArr = this.t.buf.subarray(0, n);
      oArr = this.o.buf.subarray(0, n);
      hArr = this.h.buf.subarray(0, n);
      lArr = this.l.buf.subarray(0, n);
      cArr = this.c.buf.subarray(0, n);
      vArr = this.v.buf.subarray(0, n);
      spArr = this.anySpread ? this.sp.buf.subarray(0, n) : null;
    }

    // Sort by time (stable: file order breaks ties) and drop duplicates.
    const order = new Uint32Array(n);
    let sorted = true;
    for (let i = 0; i < n; i++) {
      order[i] = i;
      if (i > 0 && tArr[i] < tArr[i - 1]) {
        sorted = false;
        if (!fromTicks) this.quality.outOfOrder++;
      }
    }
    if (!sorted) {
      const idxs = Array.from(order);
      idxs.sort((a, b) => tArr[a] - tArr[b] || a - b);
      order.set(idxs);
    }
    const out = allocBars(n, Boolean(spArr));
    let k = 0;
    for (let j = 0; j < n; j++) {
      const i = order[j];
      if (k > 0 && out.t[k - 1] === tArr[i]) {
        this.quality.duplicates++;
        if (out.o[k - 1] !== oArr[i] || out.h[k - 1] !== hArr[i] || out.l[k - 1] !== lArr[i] || out.c[k - 1] !== cArr[i]) {
          this.quality.conflictingDuplicates++;
        }
        continue;
      }
      out.t[k] = tArr[i];
      out.o[k] = oArr[i];
      out.h[k] = hArr[i];
      out.l[k] = lArr[i];
      out.c[k] = cArr[i];
      out.v[k] = vArr[i];
      if (out.sp && spArr) out.sp[k] = spArr[i];
      k++;
    }
    const bars = sliceBars(out, 0, k);

    const detectedSeconds = fromTicks ? 60 : detectSpacing(bars);
    const timeframe = detectedSeconds ? timeframeFromSeconds(detectedSeconds) : null;
    if (timeframe) analyseGaps(bars, timeframe, this.quality);

    return {
      bars,
      quality: this.quality,
      timeframe,
      detectedSeconds,
      priceBasis: this.cfg.priceBasis,
      hasSpread: Boolean(bars.sp),
      derivedFromTicks: fromTicks,
      firstT: bars.n ? bars.t[0] : NaN,
      lastT: bars.n ? bars.t[bars.n - 1] : NaN,
    };
  }
}

/** Most common positive spacing between consecutive bars. */
export function detectSpacing(b: Bars): number | null {
  if (b.n < 2) return null;
  const counts = new Map<number, number>();
  const limit = Math.min(b.n, 20_000);
  for (let i = 1; i < limit; i++) {
    const d = b.t[i] - b.t[i - 1];
    if (d > 0) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [d, c] of counts) {
    if (c > bestN) {
      best = d;
      bestN = c;
    }
  }
  // Daily data skips weekends; weekly is 7 days. Both still have a clear mode.
  return best;
}

/** Fill gap and alignment statistics. Missing candles are never invented. */
export function analyseGaps(b: Bars, tf: Timeframe, q: QualityReport) {
  const p = TF_SECONDS[tf];
  const largeThreshold = Math.max(3600, 3 * p);
  const large: GapInfo[] = [];
  for (let i = 0; i < b.n; i++) {
    if (p <= 3600 && b.t[i] % p !== 0) q.misaligned++;
    if (i === 0) continue;
    const d = b.t[i] - b.t[i - 1];
    if (d <= p) continue;
    if (p >= 86_400) {
      // D1: weekends are expected; W1: nothing expected.
      if (p === 86_400 && d <= 3 * 86_400 && isWeekendGap(b.t[i - 1] + p, b.t[i])) {
        q.weekendGaps++;
        continue;
      }
    } else if (isWeekendGap(b.t[i - 1] + p, b.t[i])) {
      q.weekendGaps++;
      continue;
    }
    q.gapCount++;
    if (d >= largeThreshold) large.push({ from: b.t[i - 1] + p, to: b.t[i], seconds: d - p });
  }
  large.sort((a, b2) => b2.seconds - a.seconds);
  q.largeGaps = large.slice(0, 25);
}

export function mergeQuality(a: QualityReport, b: QualityReport): QualityReport {
  return {
    rowsRead: a.rowsRead + b.rowsRead,
    malformed: a.malformed + b.malformed,
    malformedExamples: [...a.malformedExamples, ...b.malformedExamples].slice(0, MAX_EXAMPLES),
    invalidOhlc: a.invalidOhlc + b.invalidOhlc,
    invalidExamples: [...a.invalidExamples, ...b.invalidExamples].slice(0, MAX_EXAMPLES),
    duplicates: a.duplicates + b.duplicates,
    conflictingDuplicates: a.conflictingDuplicates + b.conflictingDuplicates,
    outOfOrder: a.outOfOrder + b.outOfOrder,
    misaligned: a.misaligned + b.misaligned,
    gapCount: a.gapCount + b.gapCount,
    largeGaps: [...a.largeGaps, ...b.largeGaps].sort((x, y) => y.seconds - x.seconds).slice(0, 25),
    weekendGaps: a.weekendGaps + b.weekendGaps,
  };
}

/** Parse a whole CSV string (tests and small files). */
export function parseCsvText(text: string, cfg: ImportConfig): ParsedImport {
  const acc = new ImportAccumulator(cfg);
  for (const line of text.split(/\r?\n/)) acc.pushLine(line);
  return acc.finish();
}
