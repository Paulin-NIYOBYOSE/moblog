import zlib from "node:zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aggregateToBars } from "../aggregate";
import { allocBars, emptyBars, lowerBound, mergeBars, sliceBars } from "../bars";
import { mergeQuality } from "../csv";
import { resolveInstrument } from "../instruments";
import { chooseScale, packBars, unpackBars } from "../pack";
import type { Bars, ChunkStatus, DatasetMeta, JournalEntry, MonthChunkInfo, PriceBasis, QualityReport, ReplaySession, SourcePreset, Timeframe } from "../types";

// Server-side persistence for Replay (PostgreSQL via Prisma). Candles are
// stored one UTC day per row (packed int32 points, deflated); every write that
// touches several rows runs in a single transaction.

export class StoreError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

const DAY = 86_400;

export function dayKeyOf(t: number): string {
  return new Date(Math.floor(t / DAY) * DAY * 1000).toISOString().slice(0, 10);
}

function dayStartOf(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 1000;
}

export function emptyQuality(): QualityReport {
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

/** Split bars into UTC days (bars must be sorted). */
export function splitByDay(b: Bars): { day: string; bars: Bars }[] {
  const out: { day: string; bars: Bars }[] = [];
  let i = 0;
  while (i < b.n) {
    const start = Math.floor(b.t[i] / DAY) * DAY;
    const end = lowerBound(b.t, b.n, start + DAY);
    out.push({ day: dayKeyOf(start), bars: sliceBars(b, i, end) });
    i = end;
  }
  return out;
}

function encodeDay(bars: Bars, minDigits: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(zlib.deflateRawSync(packBars(bars, chooseScale(bars, minDigits)), { level: 6 }));
}

function decodeDay(data: Uint8Array): Bars {
  return unpackBars(new Uint8Array(zlib.inflateRawSync(data)));
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

/** Stored part of DatasetMeta (coverage is always derived from the rows). */
type StoredMeta = Pick<DatasetMeta, "name" | "sourceTimezone" | "hasSpread" | "importedAt" | "quality" | "files" | "derivedFromTicks"> & {
  missingCandles?: boolean;
};

type DatasetRow = { id: string; symbol: string; timeframe: string; source: string; kind: string; priceBasis: string; meta: Prisma.JsonValue; version: number; updatedAt: Date };

interface MonthAgg {
  datasetId: string;
  month: string;
  n: bigint | number;
  firstT: number | null;
  lastT: number | null;
  rev: number | null;
}

async function monthAggregates(ids: string[]): Promise<Map<string, MonthChunkInfo[]>> {
  const out = new Map<string, MonthChunkInfo[]>();
  if (!ids.length) return out;
  const rows = await prisma.$queryRaw<MonthAgg[]>`
    SELECT "datasetId", substr(day, 1, 7) AS month, SUM(n) AS n, MIN("firstT") AS "firstT", MAX("lastT") AS "lastT", MAX(rev) AS rev
    FROM "ReplayCandleDay"
    WHERE "datasetId" IN (${Prisma.join(ids)}) AND status = 'ok'
    GROUP BY "datasetId", substr(day, 1, 7)
    ORDER BY month`;
  for (const r of rows) {
    const list = out.get(r.datasetId) ?? [];
    list.push({ month: r.month, n: Number(r.n), firstT: Number(r.firstT), lastT: Number(r.lastT), rev: Number(r.rev ?? 1) });
    out.set(r.datasetId, list);
  }
  return out;
}

async function providerCoverage(ids: string[]) {
  const out = new Map<string, { chunks: Record<string, { status: ChunkStatus; n: number; fetchedAt: number }>; quality: QualityReport }>();
  if (!ids.length) return out;
  const rows = await prisma.replayProviderChunk.findMany({ where: { datasetId: { in: ids } }, orderBy: { chunk: "asc" } });
  for (const r of rows) {
    const cur = out.get(r.datasetId) ?? { chunks: {}, quality: emptyQuality() };
    cur.chunks[r.chunk] = { status: r.status as ChunkStatus, n: r.n, fetchedAt: r.fetchedAt.getTime() };
    if (r.quality) cur.quality = mergeQuality(cur.quality, r.quality as unknown as QualityReport);
    out.set(r.datasetId, cur);
  }
  return out;
}

function toMeta(row: DatasetRow, months: MonthChunkInfo[], cov?: { chunks: Record<string, { status: ChunkStatus; n: number; fetchedAt: number }>; quality: QualityReport }): DatasetMeta {
  const m = (row.meta ?? {}) as unknown as StoredMeta;
  const meta: DatasetMeta = {
    id: row.id,
    name: m.name ?? row.id,
    symbol: row.symbol,
    timeframe: row.timeframe as Timeframe,
    priceBasis: row.priceBasis as PriceBasis,
    source: row.source as SourcePreset,
    sourceTimezone: m.sourceTimezone ?? "UTC",
    hasSpread: Boolean(m.hasSpread),
    importedAt: m.importedAt ?? row.updatedAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    version: row.version,
    firstT: months.length ? months[0].firstT : NaN,
    lastT: months.length ? months[months.length - 1].lastT : NaN,
    count: months.reduce((s, x) => s + x.n, 0),
    months,
    quality: row.kind === "provider" && cov ? cov.quality : (m.quality ?? emptyQuality()),
    files: m.files ?? [],
    derivedFromTicks: Boolean(m.derivedFromTicks),
    missingCandles: m.missingCandles || undefined,
  };
  if (row.kind === "provider") meta.provider = { id: "fxcm", resolution: row.timeframe as Timeframe, chunks: cov?.chunks ?? {} };
  return meta;
}

export async function listDatasets(): Promise<DatasetMeta[]> {
  const rows = await prisma.replayDataset.findMany({ orderBy: [{ symbol: "asc" }, { updatedAt: "desc" }] });
  const ids = rows.map((r) => r.id);
  const [months, cov] = await Promise.all([monthAggregates(ids), providerCoverage(rows.filter((r) => r.kind === "provider").map((r) => r.id))]);
  return rows.map((r) => toMeta(r, months.get(r.id) ?? [], cov.get(r.id)));
}

export async function getDataset(id: string): Promise<DatasetMeta | null> {
  const row = await prisma.replayDataset.findUnique({ where: { id } });
  if (!row) return null;
  const [months, cov] = await Promise.all([monthAggregates([id]), row.kind === "provider" ? providerCoverage([id]) : Promise.resolve(new Map())]);
  return toMeta(row, months.get(id) ?? [], cov.get(id));
}

export interface NewDatasetInput {
  id?: string;
  name: string;
  symbol: string;
  timeframe: Timeframe;
  source: SourcePreset | "fxcm";
  kind: "provider" | "import";
  priceBasis: PriceBasis;
  sourceTimezone: string;
  hasSpread: boolean;
  derivedFromTicks: boolean;
  quality?: QualityReport;
  files?: DatasetMeta["files"];
}

export async function createDataset(input: NewDatasetInput): Promise<DatasetMeta> {
  if (!resolveInstrument(input.symbol)) throw new StoreError(`Unknown instrument ${input.symbol}.`);
  const id = input.id ?? `ds_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const meta: StoredMeta = {
    name: input.name.trim() || `${input.symbol} ${input.timeframe}`,
    sourceTimezone: input.sourceTimezone,
    hasSpread: input.hasSpread,
    importedAt: Date.now(),
    quality: input.quality ?? emptyQuality(),
    files: input.files ?? [],
    derivedFromTicks: input.derivedFromTicks,
  };
  // INSERT … ON CONFLICT DO NOTHING: concurrent first downloads of the same
  // provider dataset must not race (Prisma's upsert isn't atomic here).
  await prisma.$executeRaw`
    INSERT INTO "ReplayDataset" (id, symbol, timeframe, source, kind, "priceBasis", meta, version, "createdAt", "updatedAt")
    VALUES (${id}, ${input.symbol}, ${input.timeframe}, ${input.source}, ${input.kind}, ${input.priceBasis}, ${JSON.stringify(meta)}::jsonb, 1, now(), now())
    ON CONFLICT (id) DO NOTHING`;
  return (await getDataset(id))!;
}

export async function updateDatasetMeta(id: string, patch: { name?: string; addFile?: DatasetMeta["files"][number]; mergeQuality?: QualityReport; hasSpread?: boolean }) {
  await prisma.$transaction(async (tx) => {
    const row = await tx.replayDataset.findUnique({ where: { id } });
    if (!row) throw new StoreError("Dataset not found.", 404);
    const m = (row.meta ?? {}) as unknown as StoredMeta;
    const next: StoredMeta = {
      ...m,
      name: patch.name?.trim() || m.name,
      files: patch.addFile ? [...(m.files ?? []), patch.addFile] : m.files,
      quality: patch.mergeQuality ? mergeQuality(m.quality ?? emptyQuality(), patch.mergeQuality) : m.quality,
      hasSpread: m.hasSpread || Boolean(patch.hasSpread),
      missingCandles: false,
    };
    await tx.replayDataset.update({ where: { id }, data: { meta: next as unknown as Prisma.InputJsonValue } });
  });
}

export async function deleteDataset(id: string) {
  await prisma.replayDataset.delete({ where: { id } }).catch((e) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return;
    throw e;
  });
}

// ---------------------------------------------------------------------------
// Candles
// ---------------------------------------------------------------------------

export interface WriteResult {
  added: number;
  duplicates: number;
  conflicts: number;
  daysWritten: number;
}

/**
 * Merge candles into a dataset (existing candles win on equal timestamps;
 * differing duplicates are counted as conflicts). Runs inside `tx`.
 */
async function writeBarsTx(tx: Prisma.TransactionClient, datasetId: string, symbol: string, bars: Bars): Promise<WriteResult> {
  const spec = resolveInstrument(symbol);
  const minDigits = spec?.digits ?? 5;
  const parts = splitByDay(bars);
  const res: WriteResult = { added: 0, duplicates: 0, conflicts: 0, daysWritten: 0 };
  if (!parts.length) return res;
  const existing = await tx.replayCandleDay.findMany({ where: { datasetId, day: { in: parts.map((p) => p.day) } } });
  const byDay = new Map(existing.map((e) => [e.day, e]));
  for (const p of parts) {
    const prev = byDay.get(p.day);
    let out = p.bars;
    let rev = 1;
    if (prev?.data && prev.status === "ok") {
      const merged = mergeBars(decodeDay(prev.data), p.bars);
      res.duplicates += merged.duplicates;
      res.conflicts += merged.conflicts;
      if (merged.bars.n === prev.n) continue; // nothing new for this day
      res.added += merged.bars.n - prev.n;
      out = merged.bars;
      rev = prev.rev + 1;
    } else res.added += out.n;
    const data = encodeDay(out, minDigits);
    const row = { status: "ok", n: out.n, firstT: out.t[0], lastT: out.t[out.n - 1], bytes: data.byteLength, data, rev, fetchedAt: new Date() };
    await tx.replayCandleDay.upsert({ where: { datasetId_day: { datasetId, day: p.day } }, create: { datasetId, day: p.day, ...row }, update: row });
    res.daysWritten++;
  }
  if (res.daysWritten) await tx.replayDataset.update({ where: { id: datasetId }, data: { version: { increment: 1 } } });
  return res;
}

export async function writeBars(datasetId: string, bars: Bars): Promise<WriteResult> {
  const ds = await prisma.replayDataset.findUnique({ where: { id: datasetId }, select: { symbol: true } });
  if (!ds) throw new StoreError("Dataset not found.", 404);
  return prisma.$transaction((tx) => writeBarsTx(tx, datasetId, ds.symbol, bars), { timeout: 60_000, maxWait: 20_000 });
}

/**
 * Packed candles for [fromT, toT] (inclusive), as one buffer of concatenated
 * day packs. Only rows in the range are read.
 */
export async function loadRangePacked(datasetId: string, fromT: number, toT: number): Promise<{ buffer: Buffer; days: number; bars: number }> {
  const rows = await prisma.replayCandleDay.findMany({
    where: { datasetId, status: "ok", day: { gte: dayKeyOf(fromT), lte: dayKeyOf(toT) } },
    orderBy: { day: "asc" },
    select: { data: true, n: true },
  });
  const parts = rows.filter((r) => r.data).map((r) => zlib.inflateRawSync(r.data!));
  return { buffer: Buffer.concat(parts), days: rows.length, bars: rows.reduce((s, r) => s + r.n, 0) };
}

/**
 * Candles in [fromT, toT] aggregated to hourly, packed — the older chart
 * history of imported datasets (years of 1-minute rows stay on the server).
 */
export async function loadHourlyPacked(datasetId: string, fromT: number, toT: number): Promise<{ buffer: Buffer; bars: number }> {
  const ds = await prisma.replayDataset.findUnique({ where: { id: datasetId }, select: { timeframe: true, symbol: true } });
  if (!ds) throw new StoreError("Dataset not found.", 404);
  const base = await loadRange(datasetId, fromT, toT);
  const tf = ds.timeframe as Timeframe;
  const hourly = tf === "H1" ? base : aggregateToBars(base, tf, "H1", "utc");
  if (!hourly.n) return { buffer: Buffer.alloc(0), bars: 0 };
  const digits = resolveInstrument(ds.symbol)?.digits ?? 5;
  return { buffer: Buffer.from(packBars(hourly, chooseScale(hourly, digits))), bars: hourly.n };
}

/** Decoded candles in [fromT, toT] — used for validation on the server. */
export async function loadRange(datasetId: string, fromT: number, toT: number): Promise<Bars> {
  const { buffer } = await loadRangePacked(datasetId, fromT, toT);
  if (!buffer.byteLength) return emptyBars();
  const all = unpackBars(new Uint8Array(buffer));
  return sliceBars(all, lowerBound(all.t, all.n, fromT), lowerBound(all.t, all.n, toT + 1e-6));
}

// ---------------------------------------------------------------------------
// Provider chunks
// ---------------------------------------------------------------------------

export interface ChunkWrite {
  chunk: string;
  status: ChunkStatus;
  bytes: number;
  quality: QualityReport | null;
  bars: Bars;
}

/** Store a provider file's candles and its coverage record atomically. */
export async function storeProviderChunk(datasetId: string, w: ChunkWrite): Promise<WriteResult> {
  const ds = await prisma.replayDataset.findUnique({ where: { id: datasetId }, select: { symbol: true } });
  if (!ds) throw new StoreError("Dataset not found.", 404);
  return prisma.$transaction(
    async (tx) => {
      const res = w.bars.n ? await writeBarsTx(tx, datasetId, ds.symbol, w.bars) : { added: 0, duplicates: 0, conflicts: 0, daysWritten: 0 };
      const quality = w.quality ? ({ ...w.quality, duplicates: w.quality.duplicates + res.duplicates } as unknown as Prisma.InputJsonValue) : Prisma.JsonNull;
      const row = { status: w.status, n: w.bars.n, bytes: w.bytes, quality, fetchedAt: new Date() };
      await tx.replayProviderChunk.upsert({ where: { datasetId_chunk: { datasetId, chunk: w.chunk } }, create: { datasetId, chunk: w.chunk, ...row }, update: row });
      return res;
    },
    { timeout: 60_000, maxWait: 20_000 },
  );
}

// ---------------------------------------------------------------------------
// Sessions & journal
// ---------------------------------------------------------------------------

type SessionRow = Awaited<ReturnType<typeof prisma.replaySession.findUnique>> & {};

function rowToSession(row: NonNullable<SessionRow>, journal: Record<string, JournalEntry> = {}): ReplaySession {
  const data = JSON.parse(row.data) as ReplaySession;
  return {
    ...data,
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    timeframe: row.timeframe as Timeframe,
    datasetId: row.datasetId,
    status: row.status as ReplaySession["status"],
    favorite: row.favorite,
    archived: row.archived,
    strategy: row.strategy,
    tags: row.tags,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    revision: row.revision,
    journal,
  };
}

/** Columns + JSON payload for a session (the journal lives in its own table). */
function sessionColumns(s: ReplaySession) {
  const { journal: _journal, revision: _revision, ...rest } = s;
  void _journal;
  void _revision;
  return {
    name: s.name.slice(0, 200),
    symbol: s.symbol,
    timeframe: s.timeframe,
    datasetId: s.datasetId,
    status: s.status,
    favorite: Boolean(s.favorite),
    archived: Boolean(s.archived),
    strategy: s.strategy ?? "",
    tags: (s.tags ?? []).slice(0, 30),
    data: JSON.stringify(rest),
  };
}

export type SessionView = "summary" | "analytics" | "full";

/** Drop heavy fields for list views. Screenshots are never sent in lists. */
function slim(s: ReplaySession, view: SessionView): ReplaySession {
  if (view === "full") return s;
  const journal: Record<string, JournalEntry> = {};
  if (view === "analytics") for (const [k, v] of Object.entries(s.journal)) journal[k] = { ...v, screenshot: v.screenshot ? "attached" : undefined };
  return {
    ...s,
    commands: [],
    drawings: [],
    ledger: view === "analytics" ? s.ledger : [],
    journal,
    commandCount: s.commands.length,
  } as ReplaySession;
}

export async function listSessions(view: SessionView = "summary"): Promise<ReplaySession[]> {
  const rows = await prisma.replaySession.findMany({ orderBy: { updatedAt: "desc" } });
  let journals = new Map<string, Record<string, JournalEntry>>();
  if (view !== "summary") {
    const entries = await prisma.replayJournalEntry.findMany({ where: { sessionId: { in: rows.map((r) => r.id) } } });
    journals = new Map();
    for (const e of entries) {
      const m = journals.get(e.sessionId) ?? {};
      m[e.tradeId] = e.entry as unknown as JournalEntry;
      journals.set(e.sessionId, m);
    }
  }
  return rows.map((r) => slim(rowToSession(r, journals.get(r.id) ?? {}), view));
}

export async function getSession(id: string): Promise<ReplaySession | null> {
  const row = await prisma.replaySession.findUnique({ where: { id }, include: { journal: true } });
  if (!row) return null;
  const journal: Record<string, JournalEntry> = {};
  for (const e of row.journal) journal[e.tradeId] = e.entry as unknown as JournalEntry;
  return rowToSession(row, journal);
}

export async function createSession(s: ReplaySession): Promise<ReplaySession> {
  const row = await prisma.replaySession.create({ data: { id: s.id, ...sessionColumns(s), revision: 1 } });
  const journal = Object.entries(s.journal ?? {});
  if (journal.length) {
    await prisma.replayJournalEntry.createMany({ data: journal.map(([tradeId, entry]) => ({ sessionId: s.id, tradeId, entry: entry as unknown as Prisma.InputJsonValue })) });
  }
  return rowToSession(row, s.journal ?? {});
}

/**
 * Save the full session state atomically. `baseRevision` must match the
 * stored revision (optimistic concurrency) — otherwise another tab or device
 * changed it first and the caller has to reload.
 */
export async function saveSession(s: ReplaySession, baseRevision: number): Promise<{ revision: number; updatedAt: number }> {
  const res = await prisma.replaySession.updateMany({ where: { id: s.id, revision: baseRevision }, data: { ...sessionColumns(s), revision: { increment: 1 } } });
  if (res.count === 0) {
    const cur = await prisma.replaySession.findUnique({ where: { id: s.id }, select: { revision: true } });
    if (!cur) throw new StoreError("This session no longer exists.", 404);
    throw new StoreError("This session was changed in another tab or window. Reload it to continue.", 409);
  }
  const row = await prisma.replaySession.findUnique({ where: { id: s.id }, select: { revision: true, updatedAt: true } });
  return { revision: row!.revision, updatedAt: row!.updatedAt.getTime() };
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

/** Small edits from the dashboard/detail page (bumps the revision). */
export async function patchSession(id: string, patch: SessionPatch): Promise<ReplaySession> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.replaySession.findUnique({ where: { id } });
    if (!row) throw new StoreError("Session not found.", 404);
    const data = JSON.parse(row.data) as ReplaySession;
    if (patch.notes !== undefined) data.notes = patch.notes.slice(0, 20_000);
    if (patch.description !== undefined) data.description = patch.description.slice(0, 2_000);
    const updated = await tx.replaySession.update({
      where: { id },
      data: {
        name: patch.name?.trim().slice(0, 200) || row.name,
        favorite: patch.favorite ?? row.favorite,
        archived: patch.archived ?? row.archived,
        tags: patch.tags ? patch.tags.map((t) => t.trim()).filter(Boolean).slice(0, 30) : row.tags,
        strategy: patch.strategy !== undefined ? patch.strategy.trim().slice(0, 120) : row.strategy,
        data: JSON.stringify(data),
        revision: { increment: 1 },
      },
    });
    return rowToSession(updated);
  });
}

export async function deleteSession(id: string) {
  await prisma.replaySession.deleteMany({ where: { id } });
}

export async function setJournalEntry(sessionId: string, tradeId: string, entry: JournalEntry | null) {
  if (!(await prisma.replaySession.findUnique({ where: { id: sessionId }, select: { id: true } }))) throw new StoreError("Session not found.", 404);
  if (!entry) {
    await prisma.replayJournalEntry.deleteMany({ where: { sessionId, tradeId } });
    return;
  }
  const value = { ...entry, updatedAt: Date.now() } as unknown as Prisma.InputJsonValue;
  await prisma.replayJournalEntry.upsert({ where: { sessionId_tradeId: { sessionId, tradeId } }, create: { sessionId, tradeId, entry: value }, update: { entry: value } });
}

/** Remove journal entries whose trades no longer exist (after a rewind). */
export async function pruneJournalEntries(sessionId: string, keep: string[]) {
  await prisma.replayJournalEntry.deleteMany({ where: { sessionId, tradeId: { notIn: keep } } });
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.replayMeta.findUnique({ where: { key } });
  return row ? (row.value as unknown as T) : fallback;
}

export async function setMeta(key: string, value: unknown) {
  const v = value as Prisma.InputJsonValue;
  await prisma.replayMeta.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

// ---------------------------------------------------------------------------
// Storage status
// ---------------------------------------------------------------------------

export async function storageStatus() {
  const [sizes, counts] = await Promise.all([
    prisma.$queryRaw<{ name: string; bytes: bigint }[]>`
      SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND c.relname LIKE 'Replay%' AND n.nspname = current_schema()`,
    prisma.$queryRaw<{ datasets: bigint; days: bigint; candles: bigint | null; sessions: bigint }[]>`
      SELECT (SELECT COUNT(*) FROM "ReplayDataset") AS datasets,
             (SELECT COUNT(*) FROM "ReplayCandleDay" WHERE status = 'ok') AS days,
             (SELECT SUM(n) FROM "ReplayCandleDay") AS candles,
             (SELECT COUNT(*) FROM "ReplaySession") AS sessions`,
  ]);
  const c = counts[0];
  return {
    bytes: sizes.reduce((s, r) => s + Number(r.bytes), 0),
    tables: Object.fromEntries(sizes.map((r) => [r.name, Number(r.bytes)])),
    datasets: Number(c.datasets),
    days: Number(c.days),
    candles: Number(c.candles ?? 0),
    sessions: Number(c.sessions),
  };
}

// ---------------------------------------------------------------------------
// Backup & restore
// ---------------------------------------------------------------------------

export const BACKUP_FORMAT = "moblog-replay-backup";
export const BACKUP_VERSION = 2;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  datasets: DatasetMeta[];
  /** Candle days as base64 packs (only when requested). */
  days?: { datasetId: string; day: string; pack: string }[];
  /** v1 (browser-era) backups stored candles per month as plain arrays. */
  chunks?: { datasetId: string; month: string; bars: { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[]; sp: (number | null)[] | null } }[];
  sessions: ReplaySession[];
  meta: { key: string; value: unknown }[];
}

export async function exportBackup(includeCandles: boolean): Promise<BackupFile> {
  const [datasets, sessions, meta] = await Promise.all([listDatasets(), prisma.replaySession.findMany({ include: { journal: true } }), prisma.replayMeta.findMany()]);
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    datasets,
    sessions: sessions.map((r) => {
      const journal: Record<string, JournalEntry> = {};
      for (const e of r.journal) journal[e.tradeId] = e.entry as unknown as JournalEntry;
      return rowToSession(r, journal);
    }),
    meta: meta.map((m) => ({ key: m.key, value: m.value })),
  };
  if (includeCandles) {
    // Provider candles can be downloaded again; imports can't.
    const ids = datasets.filter((d) => !d.provider).map((d) => d.id);
    const rows = await prisma.replayCandleDay.findMany({ where: { datasetId: { in: ids }, status: "ok" }, orderBy: [{ datasetId: "asc" }, { day: "asc" }] });
    file.days = rows.filter((r) => r.data).map((r) => ({ datasetId: r.datasetId, day: r.day, pack: Buffer.from(zlib.inflateRawSync(r.data!)).toString("base64") }));
  }
  return file;
}

export interface RestoreSummary {
  datasets: number;
  sessions: number;
  days: number;
  skipped: number;
}

function legacyBars(c: NonNullable<BackupFile["chunks"]>[number]["bars"]): Bars {
  const n = c.t.length;
  for (const k of ["o", "h", "l", "c", "v"] as const) if (!Array.isArray(c[k]) || c[k].length !== n) throw new StoreError("Backup candle arrays have inconsistent lengths.");
  const b = allocBars(n, Boolean(c.sp));
  b.t.set(c.t);
  b.o.set(c.o);
  b.h.set(c.h);
  b.l.set(c.l);
  b.c.set(c.c);
  b.v.set(c.v);
  if (b.sp && c.sp) b.sp.set(c.sp.map((x) => (x === null ? NaN : x)));
  return b;
}

/** Restore a backup (v1 browser exports or v2). Existing ids are kept unless `overwrite`. */
export async function importBackup(raw: unknown, overwrite: boolean): Promise<RestoreSummary> {
  const file = raw as BackupFile;
  if (!file || file.format !== BACKUP_FORMAT) throw new StoreError("This file is not a Replay backup.");
  if (typeof file.version !== "number" || file.version > BACKUP_VERSION) throw new StoreError("This backup was made by a newer version of Replay.");
  if (!Array.isArray(file.datasets) || !Array.isArray(file.sessions)) throw new StoreError("Backup is missing datasets or sessions.");
  const summary: RestoreSummary = { datasets: 0, sessions: 0, days: 0, skipped: 0 };
  const existingDs = new Set((await prisma.replayDataset.findMany({ select: { id: true } })).map((d) => d.id));
  const existingSessions = new Set((await prisma.replaySession.findMany({ select: { id: true } })).map((s) => s.id));

  for (const d of file.datasets) {
    if (!d?.id || !d.symbol || !resolveInstrument(d.symbol)) throw new StoreError("Backup contains an invalid dataset entry.");
    if (existingDs.has(d.id) && !overwrite) {
      summary.skipped++;
      continue;
    }
    const days = (file.days ?? []).filter((x) => x.datasetId === d.id);
    const legacy = (file.chunks ?? []).filter((x) => x.datasetId === d.id);
    const isProvider = Boolean(d.provider);
    const meta: StoredMeta = {
      name: d.name,
      sourceTimezone: d.sourceTimezone,
      hasSpread: d.hasSpread,
      importedAt: d.importedAt,
      quality: d.quality,
      files: d.files,
      derivedFromTicks: d.derivedFromTicks,
      missingCandles: !isProvider && !days.length && !legacy.length ? true : undefined,
    };
    await prisma.$transaction(
      async (tx) => {
        await tx.replayDataset.upsert({
          where: { id: d.id },
          create: { id: d.id, symbol: d.symbol, timeframe: d.timeframe, source: d.source, kind: isProvider ? "provider" : "import", priceBasis: d.priceBasis, meta: meta as unknown as Prisma.InputJsonValue },
          update: { meta: meta as unknown as Prisma.InputJsonValue },
        });
        for (const day of days) {
          const bars = unpackBars(new Uint8Array(Buffer.from(day.pack, "base64")));
          await writeBarsTx(tx, d.id, d.symbol, bars);
          summary.days++;
        }
        for (const c of legacy) {
          const r = await writeBarsTx(tx, d.id, d.symbol, legacyBars(c.bars));
          summary.days += r.daysWritten;
        }
      },
      { timeout: 300_000, maxWait: 20_000 },
    );
    summary.datasets++;
  }

  for (const s of file.sessions) {
    if (!s?.id || !Array.isArray(s.commands) || !s.settings) throw new StoreError("Backup contains an invalid session entry.");
    if (existingSessions.has(s.id) && !overwrite) {
      summary.skipped++;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.replaySession.deleteMany({ where: { id: s.id } });
      await tx.replaySession.create({ data: { id: s.id, ...sessionColumns({ ...s, status: s.status === "completed" ? "completed" : "active" }), revision: 1 } });
      const journal = Object.entries(s.journal ?? {});
      if (journal.length) await tx.replayJournalEntry.createMany({ data: journal.map(([tradeId, entry]) => ({ sessionId: s.id, tradeId, entry: entry as unknown as Prisma.InputJsonValue })) });
    });
    summary.sessions++;
  }
  for (const m of file.meta ?? []) if (m && typeof m.key === "string") await setMeta(m.key, m.value);
  return summary;
}

export { dayStartOf };
