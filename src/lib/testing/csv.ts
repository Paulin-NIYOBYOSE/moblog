// Hand-rolled CSV import/export for bulk session uploads — no new dependency.
// Handles quoted fields (commas, embedded newlines, escaped "" quotes).

import type { BacktestTrade, BacktestTradeInput } from "./types";

export const TRADE_CSV_COLUMNS = [
  "openDate",
  "closeDate",
  "pair",
  "direction",
  "pnl",
  "roi",
  "rr",
  "entry",
  "exit",
  "stopLoss",
  "takeProfit",
  "size",
  "riskAmount",
  "setup",
  "tags",
  "comment",
  "chartUrl",
] as const;

/** Parse raw CSV text into a 2D array of string cells (RFC4180-ish). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

function csvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsvTemplate(): string {
  const header = TRADE_CSV_COLUMNS.join(",");
  const example = [
    "2020-01-06",
    "2020-01-08",
    "AUDCHF",
    "LONG",
    "106.99",
    "1.9",
    "2",
    "0.6512",
    "0.6580",
    "0.6470",
    "0.6600",
    "1",
    "56",
    "Breakout",
    "news;retest",
    "Clean breakout of the daily range",
    "",
  ]
    .map(csvField)
    .join(",");
  return `${header}\n${example}\n`;
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export interface CsvParseError {
  row: number;
  message: string;
}

export interface CsvParseResult {
  rows: Omit<BacktestTradeInput, "sessionId">[];
  errors: CsvParseError[];
}

export function parseTradesCsv(text: string): CsvParseResult {
  const grid = parseCsv(text.trim());
  const errors: CsvParseError[] = [];
  const rows: Omit<BacktestTradeInput, "sessionId">[] = [];

  if (grid.length === 0) {
    return { rows, errors: [{ row: 0, message: "The file is empty." }] };
  }

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string) => header.indexOf(name.toLowerCase());

  const idx = {
    openDate: colIndex("openDate"),
    closeDate: colIndex("closeDate"),
    pair: colIndex("pair"),
    direction: colIndex("direction"),
    pnl: colIndex("pnl"),
    roi: colIndex("roi"),
    rr: colIndex("rr"),
    entry: colIndex("entry"),
    exit: colIndex("exit"),
    stopLoss: colIndex("stopLoss"),
    takeProfit: colIndex("takeProfit"),
    size: colIndex("size"),
    riskAmount: colIndex("riskAmount"),
    setup: colIndex("setup"),
    tags: colIndex("tags"),
    comment: colIndex("comment"),
    chartUrl: colIndex("chartUrl"),
  };

  if (idx.openDate === -1 || idx.pair === -1 || idx.pnl === -1) {
    return {
      rows,
      errors: [
        {
          row: 0,
          message:
            "Missing required column(s): openDate, pair, and/or pnl. Download the template for the expected header.",
        },
      ],
    };
  }

  const cell = (r: string[], i: number) => (i >= 0 && i < r.length ? r[i].trim() : "");

  for (let r = 1; r < grid.length; r++) {
    const line = grid[r];
    const rowNum = r + 1; // 1-indexed, header is row 1

    const openDateRaw = cell(line, idx.openDate);
    const pair = cell(line, idx.pair).toUpperCase();
    const pnlRaw = cell(line, idx.pnl);

    if (!openDateRaw) {
      errors.push({ row: rowNum, message: "Missing openDate." });
      continue;
    }
    const openDate = new Date(openDateRaw);
    if (Number.isNaN(openDate.getTime())) {
      errors.push({ row: rowNum, message: `Invalid openDate "${openDateRaw}".` });
      continue;
    }
    if (!pair) {
      errors.push({ row: rowNum, message: "Missing pair." });
      continue;
    }
    const pnl = toNumberOrNull(pnlRaw);
    if (pnl === null) {
      errors.push({ row: rowNum, message: `Invalid pnl "${pnlRaw}".` });
      continue;
    }

    const closeDateRaw = cell(line, idx.closeDate);
    let closeDate: string | null = null;
    if (closeDateRaw) {
      const d = new Date(closeDateRaw);
      if (Number.isNaN(d.getTime())) {
        errors.push({ row: rowNum, message: `Invalid closeDate "${closeDateRaw}".` });
        continue;
      }
      closeDate = d.toISOString();
    }

    const directionRaw = cell(line, idx.direction).toUpperCase();
    const direction = directionRaw === "SHORT" ? "SHORT" : "LONG";

    const tagsRaw = cell(line, idx.tags);
    const tags = tagsRaw
      ? tagsRaw
          .split(/[;|]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    rows.push({
      openDate: openDate.toISOString(),
      closeDate,
      pair,
      direction,
      pnl,
      roi: toNumberOrNull(cell(line, idx.roi)),
      rr: toNumberOrNull(cell(line, idx.rr)),
      entry: toNumberOrNull(cell(line, idx.entry)),
      exit: toNumberOrNull(cell(line, idx.exit)),
      stopLoss: toNumberOrNull(cell(line, idx.stopLoss)),
      takeProfit: toNumberOrNull(cell(line, idx.takeProfit)),
      size: toNumberOrNull(cell(line, idx.size)),
      riskAmount: toNumberOrNull(cell(line, idx.riskAmount)),
      setup: cell(line, idx.setup) || null,
      tags,
      comment: cell(line, idx.comment) || null,
      chartUrl: cell(line, idx.chartUrl) || null,
    });
  }

  return { rows, errors };
}

export function tradesToCsv(trades: BacktestTrade[]): string {
  const header = TRADE_CSV_COLUMNS.join(",");
  const lines = trades.map((t) =>
    [
      t.openDate,
      t.closeDate ?? "",
      t.pair,
      t.direction,
      t.pnl,
      t.roi ?? "",
      t.rr ?? "",
      t.entry ?? "",
      t.exit ?? "",
      t.stopLoss ?? "",
      t.takeProfit ?? "",
      t.size ?? "",
      t.riskAmount ?? "",
      t.setup ?? "",
      t.tags.join(";"),
      t.comment ?? "",
      t.chartUrl ?? "",
    ]
      .map(csvField)
      .join(","),
  );
  return `${header}\n${lines.join("\n")}\n`;
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
