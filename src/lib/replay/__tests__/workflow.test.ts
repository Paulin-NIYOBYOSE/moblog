import { beforeEach, describe, expect, it } from "vitest";
import { aggregate } from "../aggregate";
import { computeMetrics, enrichTrades, equityCurve } from "../analytics";
import { indexAtOrBefore } from "../bars";
import { detectFormat, parseCsvText } from "../csv";
import { ReplayEngine } from "../engine";
import { resolveInstrument } from "../instruments";
import { packBars, unpackBars } from "../pack";
import { createSession, defaultSettings, duplicateSession, rewindImpact, truncateCommands } from "../session";
import * as store from "../server/store";
import type { Command } from "../types";
import { hasDb, resetReplayTables, utc } from "./dbHelpers";

/** Deterministic synthetic M1 test fixture in HistData ASCII format (EST). */
function histdataCsv(fromUtc: number, minutes: number, price: (i: number) => number): string {
  const lines: string[] = [];
  for (let i = 0; i < minutes; i++) {
    const t = fromUtc + i * 60;
    const d = new Date((t - 5 * 3600) * 1000);
    const p2 = (n: number) => String(n).padStart(2, "0");
    const ts = `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())} ${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00`;
    const o = price(i);
    const c = price(i + 1);
    const h = Math.max(o, c) + 0.0002;
    const l = Math.min(o, c) - 0.0002;
    lines.push(`${ts};${o.toFixed(5)};${h.toFixed(5)};${l.toFixed(5)};${c.toFixed(5)};0`);
  }
  return lines.join("\n");
}

/** What the import API does: create a dataset, upload candles, record the file. */
async function importCsv(csv: string, opts: { datasetId?: string; name?: string } = {}) {
  const det = detectFormat("DAT_ASCII_EURUSD_M1_2024.csv", csv);
  const parsed = parseCsvText(csv, det.config);
  const ds = opts.datasetId
    ? (await store.getDataset(opts.datasetId))!
    : await store.createDataset({ name: opts.name ?? "EURUSD test", symbol: "EURUSD", timeframe: parsed.timeframe!, source: det.config.preset, kind: "import", priceBasis: parsed.priceBasis, sourceTimezone: det.config.timezone, hasSpread: false, derivedFromTicks: false });
  // Round-trip through the wire format exactly as the upload does.
  const w = await store.writeBars(ds.id, unpackBars(packBars(parsed.bars, 1e6)));
  await store.updateDatasetMeta(ds.id, { addFile: { name: "x.csv", size: csv.length, importedAt: Date.now(), rows: parsed.quality.rowsRead }, mergeQuality: parsed.quality });
  return { ds: (await store.getDataset(ds.id))!, w, parsed };
}

describe("candle pack format", () => {
  it("round-trips prices exactly and concatenates packs", () => {
    const { parsed } = { parsed: parseCsvText(histdataCsv(utc(2024, 1, 3), 50, (i) => 1.1 + i * 0.00001), detectFormat("DAT_ASCII_EURUSD_M1_2024.csv", "20240102 000000;1.1;1.1;1.1;1.1;0").config) };
    const a = packBars(parsed.bars, 1e5, 0, 20);
    const b = packBars(parsed.bars, 1e5, 20, 50);
    const both = new Uint8Array(a.byteLength + b.byteLength);
    both.set(a);
    both.set(b, a.byteLength);
    const back = unpackBars(both);
    expect(back.n).toBe(50);
    expect(Array.from(back.c)).toEqual(Array.from(parsed.bars.c));
    expect(Array.from(back.t)).toEqual(Array.from(parsed.bars.t));
  });
});

describe.skipIf(!hasDb)("database storage", () => {
  beforeEach(resetReplayTables);

  it("serves older history as hourly candles built from the stored 1-minute data", async () => {
    const from = utc(2024, 1, 2);
    const { ds, parsed } = await importCsv(histdataCsv(from, 3 * 1440, (i) => 1.1 + Math.sin(i / 50) * 0.002));
    const a = from + 5 * 3600;
    const b = from + 2 * 86_400 - 1;
    const { buffer, bars } = await store.loadHourlyPacked(ds.id, a, b);
    const hourly = unpackBars(new Uint8Array(buffer));
    const lo = indexAtOrBefore(parsed.bars, a - 1) + 1;
    const hi = indexAtOrBefore(parsed.bars, b);
    const expected = aggregate(parsed.bars, "M1", "H1", "utc", hi, lo);
    expect(bars).toBe(expected.length);
    expect(hourly.n).toBe(expected.length);
    for (let i = 0; i < hourly.n; i++) {
      expect([hourly.t[i], hourly.o[i], hourly.h[i], hourly.l[i], hourly.c[i]]).toEqual([expected[i].time, expected[i].open, expected[i].high, expected[i].low, expected[i].close]);
    }
  });

  it("stores candles per UTC day, loads only the requested range and merges appends", async () => {
    // 30 Jan 22:00 → 1 Feb 02:00 UTC spans two months and three days.
    const start = utc(2024, 1, 30, 22);
    const { ds } = await importCsv(histdataCsv(start, 60 * 28, (i) => 1.1 + Math.sin(i / 50) * 0.002));
    expect(ds.months.map((m) => m.month)).toEqual(["2024-01", "2024-02"]);
    expect(ds.count).toBe(60 * 28);
    expect(ds.files).toHaveLength(1);

    const feb = await store.loadRange(ds.id, utc(2024, 2, 1), utc(2024, 2, 1, 1));
    expect(feb.n).toBe(61);
    expect(feb.t[0]).toBe(utc(2024, 2, 1));

    // Append overlapping data: 10 existing minutes (all conflicting) + 20 new.
    const { ds: ds2, w } = await importCsv(histdataCsv(start + (60 * 28 - 10) * 60, 30, (i) => 1.2 + i * 0.0001), { datasetId: ds.id });
    expect(w.added).toBe(20);
    expect(w.duplicates).toBe(10);
    expect(w.conflicts).toBe(10);
    expect(ds2.count).toBe(60 * 28 + 20);
    expect(ds2.months.find((m) => m.month === "2024-02")!.rev).toBe(2);
    expect(ds2.months.find((m) => m.month === "2024-01")!.rev).toBe(1);
    expect(ds2.files).toHaveLength(2);

    await store.deleteDataset(ds.id);
    expect(await store.listDatasets()).toHaveLength(0);
    expect((await store.loadRange(ds.id, 0, 2e9)).n).toBe(0);
  });

  it("detects concurrent edits instead of overwriting (optimistic revisions)", async () => {
    const { ds } = await importCsv(histdataCsv(utc(2024, 1, 3, 8), 120, (i) => 1.1 + i * 0.00001));
    const s = createSession({ name: "Rev", strategy: "", dataset: ds, timeframe: "M5", startT: ds.firstT + 1800, endT: ds.lastT, historyMonths: 1, settings: defaultSettings(ds), displayTimezone: "UTC" });
    const created = await store.createSession(s);
    expect(created.revision).toBe(1);
    const tabA = { ...created };
    const tabB = { ...created };
    const r1 = await store.saveSession({ ...tabA, cursorT: tabA.cursorT + 60 }, tabA.revision!);
    expect(r1.revision).toBe(2);
    await expect(store.saveSession({ ...tabB, cursorT: tabB.cursorT + 120 }, tabB.revision!)).rejects.toMatchObject({ status: 409 });
    // Dashboard edits bump the revision too.
    const patched = await store.patchSession(s.id, { name: "Renamed", favorite: true, tags: [" london ", "", "a+"], notes: "n" });
    expect(patched).toMatchObject({ name: "Renamed", favorite: true, tags: ["london", "a+"], notes: "n", revision: 3 });
    await expect(store.saveSession({ ...tabA, revision: 2 }, 2)).rejects.toMatchObject({ status: 409 });
  });

  it("import → session → replay → trade → exit → journal → analytics → reload → backup", async () => {
    // Wed 3 Jan 2024 08:00 UTC, 6 hours of a steady uptrend then a reversal.
    const start = utc(2024, 1, 3, 8);
    const { ds, parsed } = await importCsv(histdataCsv(start, 360, (i) => (i < 200 ? 1.1 + i * 0.00005 : 1.11 - (i - 200) * 0.00008)));
    expect(parsed.quality.malformed + parsed.quality.invalidOhlc).toBe(0);

    const session = createSession({
      name: "Workflow",
      strategy: "Trend pullback",
      dataset: ds,
      timeframe: "M15",
      startT: start + 60 * 60,
      endT: ds.lastT,
      historyMonths: 1,
      settings: { ...defaultSettings(ds), spreadPips: 1, commissionPerLot: 7, riskPercent: 1 },
      displayTimezone: "UTC",
    });
    expect(session.historyStartT).toBe(ds.firstT);
    let saved = await store.createSession(session);

    const bars = await store.loadRange(ds.id, session.historyStartT, session.endT);
    expect(bars.n).toBe(360);
    const startIndex = indexAtOrBefore(bars, session.startT);
    const mk = () => new ReplayEngine({ bars, baseTf: ds.timeframe, spec: resolveInstrument(ds.symbol)!, basis: ds.priceBasis, settings: session.settings, startIndex, sessionId: session.id });
    const engine = mk();
    expect(engine.state.index).toBe(60);

    // Advance 30 minutes, then buy with a 10-pip stop and 20-pip target.
    engine.advanceTo(startIndex + 30);
    const entryEst = engine.quoteAt().ask;
    const cmd: Command = { id: "cmd1", at: bars.t[engine.state.index], type: "market", side: "buy", lots: 0.5, sl: +(entryEst - 0.001).toFixed(5), tp: +(entryEst + 0.002).toFixed(5), timeframe: "M15" };
    expect(engine.apply(cmd).ok).toBe(true);

    // The uptrend reaches the target ~40 minutes later.
    engine.advanceTo(startIndex + 120);
    expect(engine.state.trades).toHaveLength(1);
    const [t] = engine.state.trades;
    expect(t.exitReason).toBe("tp");
    expect(t.commission).toBeCloseTo(3.5, 9);
    expect(t.grossPnl).toBeCloseTo((t.exitPrice - t.entryPrice) * 50_000, 6);
    expect(t.netPnl).toBeCloseTo(t.grossPnl - 3.5, 9);
    expect(t.rMultiple).toBeCloseTo(t.netPnl / t.initialRisk!, 12);
    expect(engine.state.balance).toBeCloseTo(10_000 + t.netPnl, 9);

    // Analytics derive from the ledger.
    expect(equityCurve(engine.state.trades, 10_000).at(-1)!.equity).toBeCloseTo(engine.state.balance, 9);
    const m = computeMetrics(enrichTrades(engine.state.trades, {}, session.strategy, session.name), 10_000);
    expect(m).toMatchObject({ total: 1, winRate: 100, profitFactorNote: "no-losses" });

    // Persist state + a drawing + a journal entry, then reload from the database.
    const drawing = { id: "d1", kind: "fib" as const, points: [{ t: bars.t[10], p: 1.1 }, { t: bars.t[50], p: 1.105 }], color: "#2a78d6", locked: true };
    const next = { ...saved, commands: [cmd], drawings: [drawing], cursorT: bars.t[engine.state.index] + 60, ledger: engine.state.trades, summary: engine.summary() };
    const rev = await store.saveSession(next, saved.revision!);
    saved = { ...next, revision: rev.revision };
    await store.setJournalEntry(session.id, t.id, { notes: "Clean retest", tags: ["a+"], setup: "Retest", confidence: 4, screenshot: "data:image/png;base64,AAAA" });
    await expect(store.setJournalEntry("nope", t.id, { notes: "x" })).rejects.toMatchObject({ status: 404 });

    const restored = (await store.getSession(session.id))!;
    expect(restored.commands).toEqual([cmd]);
    expect(restored.drawings).toEqual([drawing]);
    expect(restored.journal[t.id]).toMatchObject({ notes: "Clean retest", tags: ["a+"], confidence: 4 });
    expect(restored.ledger).toEqual(engine.state.trades);
    const again = new ReplayEngine({ ...mk().cfg, bars: await store.loadRange(ds.id, restored.historyStartT, restored.endT) });
    again.rebuild(restored.commands, indexAtOrBefore(bars, restored.cursorT - 60));
    expect(again.state.trades).toEqual(restored.ledger);
    expect(again.state.balance).toBe(engine.state.balance);

    // Lists never ship commands/drawings; analytics lists carry ledger + journal without screenshots.
    const [summary] = await store.listSessions("summary");
    expect(summary.commands).toEqual([]);
    expect(summary.commandCount).toBe(1);
    expect(summary.ledger).toEqual([]);
    const [analytics] = await store.listSessions("analytics");
    expect(analytics.ledger).toHaveLength(1);
    expect(analytics.journal[t.id].screenshot).toBe("attached");

    // Stepping back before the entry undoes it — and prunes its journal entry.
    const target = bars.t[startIndex + 10];
    const impact = rewindImpact(restored.commands, restored.ledger, target);
    expect(impact.droppedCommands).toHaveLength(1);
    expect(impact.affectedTrades).toHaveLength(1);
    const rewound = mk();
    rewound.rebuild(truncateCommands(restored.commands, target), startIndex + 10);
    expect(rewound.state.trades).toHaveLength(0);
    await store.pruneJournalEntries(session.id, []);
    expect((await store.getSession(session.id))!.journal).toEqual({});
    await store.setJournalEntry(session.id, t.id, { notes: "Clean retest" });

    // Duplicates are independent sessions.
    const dup = duplicateSession(restored, { keepProgress: false, name: "Copy" });
    expect(dup.commands).toHaveLength(0);
    expect(dup.parentId).toBe(restored.id);
    await store.createSession({ ...dup, revision: undefined });
    expect(await store.listSessions()).toHaveLength(2);

    // Backup → wipe → restore.
    const backup = JSON.parse(JSON.stringify(await store.exportBackup(true)));
    expect(backup.days.length).toBe(1);
    await resetReplayTables();
    const r = await store.importBackup(backup, false);
    expect(r).toMatchObject({ sessions: 2, datasets: 1, days: 1 });
    const back = await store.loadRange(ds.id, restored.historyStartT, restored.endT);
    expect(Array.from(back.c)).toEqual(Array.from(bars.c));
    const s2 = (await store.getSession(session.id))!;
    expect(s2.ledger).toEqual(restored.ledger);
    expect(s2.journal[t.id]).toMatchObject({ notes: "Clean retest" });
    // Restoring again without overwrite skips everything.
    expect((await store.importBackup(backup, false)).skipped).toBe(3);
    await expect(store.importBackup({ format: "nope" }, false)).rejects.toThrow(/not a Replay backup/);

    const status = await store.storageStatus();
    expect(status).toMatchObject({ datasets: 1, days: 1, candles: 360, sessions: 2 });
    expect(status.bytes).toBeGreaterThan(0);
  });

  it("restores v1 backups exported from the old browser-only version", async () => {
    const start = utc(2024, 1, 3, 8);
    const det = detectFormat("DAT_ASCII_EURUSD_M1_2024.csv", "20240102 000000;1.1;1.1;1.1;1.1;0");
    const parsed = parseCsvText(histdataCsv(start, 30, (i) => 1.1 + i * 0.00001), det.config);
    const ds = { id: "ds_legacy", name: "Old", symbol: "EURUSD", timeframe: "M1", priceBasis: "bid", source: "histdata-ascii", sourceTimezone: "Etc/GMT+5", hasSpread: false, importedAt: 1, updatedAt: 1, version: 1, firstT: parsed.bars.t[0], lastT: parsed.bars.t[29], count: 30, months: [{ month: "2024-01", n: 30, firstT: 0, lastT: 0, rev: 1 }], quality: parsed.quality, files: [], derivedFromTicks: false };
    const session = createSession({ name: "Old session", strategy: "", dataset: ds as never, timeframe: "M1", startT: parsed.bars.t[10], endT: parsed.bars.t[29], historyMonths: 1, settings: defaultSettings(ds as never), displayTimezone: "UTC" });
    const v1 = {
      format: "moblog-replay-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      datasets: [ds],
      sessions: [{ ...session, journal: { p_x: { notes: "kept" } } }],
      meta: [{ key: "strategies", value: [{ id: "s1", name: "Breakout", description: "", setups: ["Retest"], tags: [], checklist: [] }] }],
      chunks: [{ datasetId: "ds_legacy", month: "2024-01", bars: { t: Array.from(parsed.bars.t), o: Array.from(parsed.bars.o), h: Array.from(parsed.bars.h), l: Array.from(parsed.bars.l), c: Array.from(parsed.bars.c), v: Array.from(parsed.bars.v), sp: null } }],
    };
    const r = await store.importBackup(v1, false);
    expect(r).toMatchObject({ sessions: 1, datasets: 1 });
    expect((await store.loadRange("ds_legacy", 0, 2e9)).n).toBe(30);
    expect((await store.getSession(session.id))!.journal.p_x).toMatchObject({ notes: "kept" });
    expect(await store.getMeta("strategies", [])).toHaveLength(1);
  });
});
