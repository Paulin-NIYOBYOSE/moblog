import { beforeEach, describe, expect, it } from "vitest";
import { checkAvailability, ensureProviderData, planRequest, providerDatasetId, ProviderUnavailableError, type DataRequest, type MarketDataApi } from "../marketData";
import { isCompleteWeek } from "../providers";
import { exnessMonths, parseExnessTicks } from "../providers/exness";
import { fxcmWeekOf, parseFxcmCsv, planFxcmChunks, weekSundayOf } from "../providers/fxcm";
import { ingestChunk, probeChunk, ProviderBusyError, type FileFetcher } from "../server/ingest";
import { createDataset, getDataset, loadRange, StoreError, storeProviderChunk } from "../server/store";
import { ApiError } from "../storage/repo";
import { exnessPrice, fakeProviders, fxcmFile, hasDb, resetReplayTables, utc, WEEK_MINUTES } from "./dbHelpers";

const NOW = utc(2026, 10, 18, 12);

/**
 * The pipeline's API backed by the real server code (ingest + PostgreSQL)
 * and fake providers. Errors are translated exactly as the HTTP layer does.
 */
function serverApi(fetcher: FileFetcher, signalCheck = true): MarketDataApi {
  const http = async <T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (signalCheck && signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ProviderBusyError) throw new ApiError(e.message, 503, { busy: true, retryAfter: e.retryAfterSec });
      if (e instanceof StoreError) throw new ApiError(e.message, e.status);
      throw e;
    }
  };
  return {
    getDataset: async (id) => (await getDataset(id)) ?? undefined,
    probe: (req, c, signal) => http(() => probeChunk({ symbol: req.symbol, resolution: req.resolution, year: c.year, week: c.week, fromT: c.fromT }, fetcher), signal),
    ingest: (req, c, signal, final) => http(() => ingestChunk({ symbol: req.symbol, resolution: req.resolution, year: c.year, week: c.week, fromT: c.fromT }, { fetcher, final }), signal),
  };
}

describe("FXCM week numbering (verified against real files)", () => {
  // [Sunday that opens the week, expected year/week file] — every pair was
  // observed on candledata.fxcorporate.com in October 2026.
  const observed: [number, number, number][] = [
    [utc(2012, 1, 1), 2012, 1],
    [utc(2012, 3, 4), 2012, 10],
    [utc(2019, 12, 29), 2019, 53],
    [utc(2020, 12, 27), 2020, 53],
    [utc(2021, 1, 3), 2021, 1],
    [utc(2021, 12, 26), 2021, 52],
    [utc(2022, 1, 2), 2022, 1],
    [utc(2023, 1, 1), 2023, 1],
    [utc(2024, 3, 3), 2024, 10],
    [utc(2025, 12, 21), 2025, 52],
    [utc(2025, 12, 28), 2025, 53],
    [utc(2026, 1, 4), 2026, 1],
    [utc(2026, 1, 11), 2026, 2],
    [utc(2026, 10, 4), 2026, 40],
  ];
  it.each(observed)("Sunday %i → %i/W%i", (sunday, year, week) => {
    expect(fxcmWeekOf(sunday)).toEqual({ year, week });
  });

  it("assigns timestamps to the week opening on the previous Sunday evening", () => {
    expect(weekSundayOf(utc(2024, 3, 3, 22, 3))).toBe(utc(2024, 3, 3)); // first candle of the week
    expect(weekSundayOf(utc(2024, 3, 8, 21, 59))).toBe(utc(2024, 3, 3)); // Friday close
    expect(weekSundayOf(utc(2024, 3, 9, 12))).toBe(utc(2024, 3, 3)); // Saturday
    expect(weekSundayOf(utc(2024, 3, 10, 21))).toBe(utc(2024, 3, 10));
  });

  it("plans one file per trading week covering the range", () => {
    const chunks = planFxcmChunks(utc(2024, 3, 5), utc(2024, 3, 20));
    expect(chunks.map((c) => c.key)).toEqual(["2024-W10", "2024-W11", "2024-W12"]);
    // Years that don't start a week 1 (2025 starts with 2024/53).
    expect(planFxcmChunks(utc(2024, 12, 31), utc(2025, 1, 8)).map((c) => c.key)).toEqual(["2024-W53", "2025-W02"]);
  });
});

describe("FXCM file parsing and validation", () => {
  it("keeps bid OHLC, records the real spread and rejects bad rows", () => {
    const sunday = utc(2024, 3, 3);
    const chunk = planFxcmChunks(sunday + 86_400, sunday + 2 * 86_400)[0];
    const text = fxcmFile(sunday, {
      minutes: 10,
      badRows: [
        "03/04/2024 00:30:00.000,1.1,1.0,1.2,1.1,1.1,1.2,1.0,1.1", // high < low
        "garbage row",
        "03/04/2024 00:31:00.000,abc,1.2,1.0,1.1,1.1,1.2,1.0,1.1",
        "02/20/2024 00:31:00.000,1.1,1.2,1.0,1.1,1.1,1.2,1.0,1.1", // outside the week
      ],
    });
    const parsed = parseFxcmCsv(text, chunk);
    expect(parsed.bars.n).toBe(10);
    expect(parsed.bars.t[0]).toBe(sunday + 22 * 3600);
    expect(parsed.bars.sp![0]).toBeCloseTo(0.0001, 9);
    expect(parsed.quality.invalidOhlc).toBe(1);
    expect(parsed.quality.malformed).toBe(2);
    expect(parsed.outsideWindow).toBe(1);
  });

  it("refuses files that aren't in the FXCM format", () => {
    expect(() => parseFxcmCsv("Gmt time,Open,High,Low,Close\n")).toThrow(/format/);
  });
});

describe("Exness tick files", () => {
  const head = '"Exness","Symbol","Timestamp","Bid","Ask"';
  const row = (ts: string, bid: number, ask: number) => `"exness","EURUSD","${ts}Z",${bid},${ask}`;
  const window = { fromT: utc(2024, 3, 3, 12), toT: utc(2024, 3, 10, 12) - 1 };

  it("builds bid candles with the spread at their first and last tick", () => {
    const text = [
      head,
      row("2024-03-03 11:59:59.900", 1.0, 1.0001), // before the week: skipped
      row("2024-03-04 10:00:01.100", 1.085, 1.0851),
      row("2024-03-04 10:00:20.000", 1.0856, 1.0858),
      row("2024-03-04 10:00:59.999", 1.0852, 1.0855),
      row("2024-03-04 10:01:00.000", 1.0853, 1.0854),
      "garbage",
      row("2024-03-04 10:01:30.000", -1, 1.08),
      "",
    ].join("\r\n");
    const m1 = parseExnessTicks(text, window, 60);
    expect(m1.bars.n).toBe(2);
    expect(Array.from(m1.bars.t)).toEqual([utc(2024, 3, 4, 10, 0), utc(2024, 3, 4, 10, 1)]);
    expect([m1.bars.o[0], m1.bars.h[0], m1.bars.l[0], m1.bars.c[0]]).toEqual([1.085, 1.0856, 1.085, 1.0852]);
    expect(m1.bars.sp![0]).toBeCloseTo((0.0001 + 0.0003) / 2, 9);
    expect(m1.quality.malformed).toBe(2);
    expect(m1.quality.rowsRead).toBe(4);
    const h1 = parseExnessTicks(text, window, 3600);
    expect(h1.bars.n).toBe(1);
    expect([h1.bars.o[0], h1.bars.h[0], h1.bars.l[0], h1.bars.c[0]]).toEqual([1.085, 1.0856, 1.085, 1.0853]);
  });

  it("refuses files that aren't in the Exness format", () => {
    expect(() => parseExnessTicks("Gmt time,Bid,Ask\n", window)).toThrow(/format/);
  });

  it("lists the month files a week needs", () => {
    expect(exnessMonths(utc(2024, 3, 31, 12), utc(2024, 4, 7, 12) - 1)).toEqual([
      { year: 2024, month: 3 },
      { year: 2024, month: 4 },
    ]);
    expect(exnessMonths(utc(2024, 12, 29, 12), utc(2025, 1, 5, 12) - 1)).toEqual([
      { year: 2024, month: 12 },
      { year: 2025, month: 1 },
    ]);
  });
});

describe("complete-week check", () => {
  const week = { fromT: utc(2024, 3, 3, 12) };
  const minutes = (from: number, n: number, skip?: [number, number]) => {
    const t: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = from + i * 60;
      if (!skip || x < skip[0] || x >= skip[1]) t.push(x);
    }
    return t;
  };

  it("accepts a full week and rejects truncated, late or holed weeks", () => {
    const full = minutes(utc(2024, 3, 3, 22), WEEK_MINUTES);
    expect(isCompleteWeek(full, full.length, week, "M1")).toBe(true);
    const cut = full.slice(0, 160); // FXCM 2025-W26: a couple of hours
    expect(isCompleteWeek(cut, cut.length, week, "M1")).toBe(false);
    const late = minutes(utc(2024, 3, 4, 6), WEEK_MINUTES - 480);
    expect(isCompleteWeek(late, late.length, week, "M1")).toBe(false);
    const holed = minutes(utc(2024, 3, 3, 22), WEEK_MINUTES, [utc(2024, 3, 6, 10), utc(2024, 3, 6, 14)]);
    expect(holed.length).toBeGreaterThan(0.95 * WEEK_MINUTES);
    expect(isCompleteWeek(holed, holed.length, week, "M1")).toBe(false);
  });
});

const REQ: DataRequest = { symbol: "EURUSD", resolution: "M1", fromT: utc(2024, 3, 4), toT: utc(2024, 3, 29) };
const noSleep = { sleep: async () => undefined, nowSec: NOW };
const FXCM_WEEKS = ["GET 2024-W10", "GET 2024-W11", "GET 2024-W12", "GET 2024-W13"];

describe.skipIf(!hasDb)("download pipeline (server ingest → PostgreSQL)", () => {
  beforeEach(resetReplayTables);

  it("downloads missing weeks, then reuses the cache on the next run", async () => {
    const { fetcher, calls } = fakeProviders();
    const api = serverApi(fetcher);
    const stages: string[] = [];
    const r1 = await ensureProviderData(REQ, { api, ...noSleep, onProgress: (p) => stages.push(p.stage) });
    expect(r1.progress.chunksTotal).toBe(4);
    expect(r1.progress.chunksDone).toBe(4);
    expect(r1.progress.candlesDownloaded).toBe(4 * WEEK_MINUTES);
    expect(r1.progress.sources).toEqual({ fxcm: 4 });
    expect(calls.some((c) => c.startsWith("EXNESS"))).toBe(false); // complete FXCM weeks need no fallback
    expect(stages).toContain("download");
    expect(stages).toContain("save");
    expect(stages.at(-1)).toBe("done");
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(ds.count).toBe(4 * WEEK_MINUTES);
    expect(ds.hasSpread).toBe(true);
    expect(Object.keys(ds.provider!.chunks)).toHaveLength(4);
    expect(ds.provider!.chunks["2024-W10"]).toMatchObject({ status: "ok", source: "fxcm", tried: ["fxcm"] });
    const bars = await loadRange(ds.id, ds.firstT, ds.lastT);
    expect(bars.n).toBe(4 * WEEK_MINUTES);
    expect(bars.sp![0]).toBeCloseTo(0.0001, 9);
    // W10 opens Sunday 22:00, two hours before the requested Monday start;
    // the range ends on W13's Friday at 00:00, before its last 1 319 minutes.
    expect((await loadRange(ds.id, REQ.fromT, REQ.toT)).n).toBe(4 * WEEK_MINUTES - 120 - 1319);
    for (let i = 1; i < bars.n; i++) expect(bars.t[i]).toBeGreaterThan(bars.t[i - 1]);

    calls.length = 0;
    const r2 = await ensureProviderData(REQ, { api, ...noSleep });
    expect(calls).toEqual([]); // nothing re-downloaded
    expect(r2.progress.chunksCached).toBe(4);
    expect(r2.progress.candlesCached).toBe(4 * WEEK_MINUTES);

    // Extending the range downloads only the new week.
    calls.length = 0;
    await ensureProviderData({ ...REQ, toT: utc(2024, 4, 5) }, { api, ...noSleep });
    expect(calls.filter((c) => c.startsWith("GET"))).toEqual(["GET 2024-W14"]);
  });

  it("fills weeks FXCM is missing or has broken from Exness — no error, no gap", async () => {
    // The real archive has all of these: 404s, 0-byte files (2024-W51), and files that aren't gzip.
    const { fetcher, calls } = fakeProviders({ missing: ["2024-W11"], emptyFile: ["2024-W12"], corrupt: ["2024-W13"] });
    const messages: string[] = [];
    const r = await ensureProviderData(REQ, { api: serverApi(fetcher), ...noSleep, onProgress: (p) => messages.push(p.message) });
    expect(r.missing).toEqual([]);
    expect(r.progress.sources).toEqual({ fxcm: 1, exness: 3 });
    expect(messages.some((m) => /^Stored 2024-W12 from Exness: 7.200 validated candles \(FXCM published an empty file for this week\)$/.test(m))).toBe(true);
    // Every week is in March: the month file is downloaded once and reused.
    expect(calls.filter((c) => c === "EXNESS GET 2024-03")).toHaveLength(1);
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(ds.count).toBe(4 * WEEK_MINUTES);
    for (const w of ["2024-W11", "2024-W12", "2024-W13"]) expect(ds.provider!.chunks[w]).toMatchObject({ status: "ok", source: "exness", tried: ["fxcm", "exness"], n: WEEK_MINUTES });
    const w12 = planFxcmChunks(utc(2024, 3, 18), utc(2024, 3, 19))[0];
    const bars = await loadRange(ds.id, w12.fromT, w12.toT);
    expect(bars.n).toBe(WEEK_MINUTES);
    expect(bars.c[0]).toBeCloseTo(exnessPrice(bars.t[0]) + 0.00002, 9);
    expect(bars.sp![0]).toBeCloseTo(0.00006, 9);
  });

  it("replaces a truncated FXCM week with the complete one", async () => {
    const { fetcher } = fakeProviders({ truncated: { "2024-W11": 160 } });
    const r = await ensureProviderData(REQ, { api: serverApi(fetcher), ...noSleep });
    expect(r.progress.sources).toEqual({ fxcm: 3, exness: 1 });
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(ds.provider!.chunks["2024-W11"]).toMatchObject({ status: "ok", source: "exness", n: WEEK_MINUTES });
  });

  it("uses Exness straight away while FXCM is busy", async () => {
    const { fetcher } = fakeProviders({ failFirst: { "2024-W11": 99 } });
    const retries: string[] = [];
    const r = await ensureProviderData(REQ, { api: serverApi(fetcher), ...noSleep, onProgress: (p) => p.retrying && retries.push(p.retrying.chunk) });
    expect(retries).toEqual([]);
    expect(r.progress.sources).toEqual({ fxcm: 3, exness: 1 });
    expect((await getDataset(providerDatasetId(REQ)))!.provider!.chunks["2024-W11"]).toMatchObject({ status: "ok", source: "exness", tried: ["exness"] });
  });

  it("retries transient errors with backoff and honours Retry-After when every provider is busy", async () => {
    const { fetcher } = fakeProviders({ failFirst: { "2024-W11": 2 }, retryAfter: { "2024-W12": 7 }, exness: { down: true } });
    const waits: number[] = [];
    const retries: string[] = [];
    const r = await ensureProviderData(REQ, {
      api: serverApi(fetcher),
      nowSec: NOW,
      sleep: async (ms) => {
        waits.push(ms);
      },
      onProgress: (p) => p.retrying && retries.push(`${p.retrying.chunk}#${p.retrying.attempt}`),
    });
    expect(r.progress.chunksDone).toBe(4);
    expect(r.progress.sources).toEqual({ fxcm: 4 });
    expect(retries).toEqual(expect.arrayContaining(["2024-W11#1", "2024-W11#2", "2024-W12#1"]));
    expect(waits).toEqual(expect.arrayContaining([1000, 2000, 7000])); // backoff + Retry-After
  });

  it("gives up after bounded attempts with a clear error, keeping finished weeks", async () => {
    const { fetcher } = fakeProviders({ failFirst: { "2024-W13": 99 }, exness: { down: true } });
    const run = ensureProviderData(REQ, { api: serverApi(fetcher), ...noSleep, concurrency: 1, maxAttempts: 3 });
    await expect(run).rejects.toThrow(ProviderUnavailableError);
    await expect(run).rejects.toThrow(/2024-W13 .*FXCM had a server error; Exness had a server error/);
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(Object.keys(ds.provider!.chunks).sort()).toEqual(["2024-W10", "2024-W11", "2024-W12"]);
  });

  it("on the last attempt stores what the other provider answered and asks the busy one again next time", async () => {
    const { fetcher } = fakeProviders({ failFirst: { "2024-W11": 99 }, exness: { missingMonths: ["2024-03"] } });
    const r = await ensureProviderData(REQ, { api: serverApi(fetcher), ...noSleep, maxAttempts: 2 });
    expect(r.missing).toEqual(["2024-W11"]);
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(ds.provider!.chunks["2024-W11"]).toMatchObject({ status: "missing", source: null, tried: ["exness"] });
    expect(planRequest(REQ, ds, NOW).pending.map((c) => c.key)).toEqual(["2024-W11"]); // FXCM wasn't asked yet
  });

  it("reports weeks no provider has instead of inventing them", async () => {
    const { fetcher } = fakeProviders({ missing: ["2024-W11"], exness: { missingMonths: ["2024-03"] } });
    const r = await ensureProviderData(REQ, { api: serverApi(fetcher), ...noSleep });
    expect(r.missing).toEqual(["2024-W11"]);
    expect(r.progress.chunksMissing).toBe(1);
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(ds.provider!.chunks["2024-W11"]).toMatchObject({ status: "missing", tried: ["fxcm", "exness"] });
    expect(ds.count).toBe(3 * WEEK_MINUTES);
    // Old missing weeks aren't re-requested on every run.
    const plan = planRequest(REQ, ds, NOW);
    expect(plan.knownMissing.map((c) => c.key)).toEqual(["2024-W11"]);
    expect(plan.pending).toHaveLength(0);
  });

  it("repairs weeks stored before Exness was added, replacing truncated candles whole", async () => {
    const id = providerDatasetId(REQ);
    await createDataset({ id, name: "EURUSD M1 · FXCM", symbol: "EURUSD", timeframe: "M1", source: "fxcm", kind: "provider", priceBasis: "bid", sourceTimezone: "UTC", hasSpread: true, derivedFromTicks: false });
    const [w10, w11, w12, w13] = planFxcmChunks(REQ.fromT, REQ.toT);
    const legacy = async (w: typeof w10, status: "ok" | "missing" | "empty", minutes: number) => {
      const sunday = weekSundayOf(w.fromT);
      // A truncated week holds only Friday afternoon (from Sunday + 115 h).
      const bars = parseFxcmCsv(fxcmFile(sunday, { minutes, startHour: minutes === WEEK_MINUTES ? 22 : 115 }), w).bars;
      await storeProviderChunk(id, { chunk: w.key, window: w, status, source: status === "ok" ? "fxcm" : null, tried: ["fxcm"], bytes: 1, quality: null, bars });
    };
    await legacy(w10, "ok", WEEK_MINUTES);
    await legacy(w11, "missing", 0);
    await legacy(w12, "empty", 0);
    await legacy(w13, "ok", 160); // FXCM 2025-W26: only Friday afternoon
    const before = (await getDataset(id))!;
    expect(planRequest(REQ, before, NOW).pending.map((c) => c.key)).toEqual(["2024-W11", "2024-W12", "2024-W13"]);

    const { fetcher, calls } = fakeProviders({ missing: ["2024-W11"], emptyFile: ["2024-W12"], truncated: { "2024-W13": 160 } });
    const r = await ensureProviderData(REQ, { api: serverApi(fetcher), ...noSleep });
    expect(calls).not.toContain("GET 2024-W10");
    expect(r.missing).toEqual([]);
    const ds = (await getDataset(id))!;
    expect(ds.count).toBe(4 * WEEK_MINUTES);
    expect(ds.provider!.chunks["2024-W13"]).toMatchObject({ status: "ok", source: "exness", tried: ["fxcm", "exness"] });
    // No FXCM minute is left inside the repaired week: it comes from one provider.
    const bars = await loadRange(id, w13.fromT, w13.toT);
    expect(bars.n).toBe(WEEK_MINUTES);
    for (let i = 0; i < bars.n; i++) expect(bars.o[i]).toBeGreaterThan(1.29);
    expect(planRequest(REQ, ds, NOW).pending).toHaveLength(0);
  });

  it("can be cancelled and resumes without re-downloading", async () => {
    const { fetcher, calls } = fakeProviders();
    const api = serverApi(fetcher);
    const ctrl = new AbortController();
    let done = 0;
    const r = await ensureProviderData(REQ, {
      api,
      ...noSleep,
      concurrency: 1,
      signal: ctrl.signal,
      onProgress: (p) => {
        if (p.chunksDone > done) {
          done = p.chunksDone;
          if (done === 2) ctrl.abort();
        }
      },
    });
    expect(r.cancelled).toBe(true);
    const kept = Object.keys((await getDataset(providerDatasetId(REQ)))!.provider!.chunks);
    expect(kept.length).toBeGreaterThanOrEqual(2);
    calls.length = 0;
    const r2 = await ensureProviderData(REQ, { api, ...noSleep });
    expect(r2.cancelled).toBe(false);
    expect(calls.filter((c) => FXCM_WEEKS.includes(c)).length).toBe(4 - kept.length);
  });

  it("skips weeks that haven't finished yet", () => {
    const plan = planRequest({ ...REQ, fromT: utc(2026, 9, 20), toT: utc(2026, 10, 30) }, undefined, NOW);
    expect(plan.unpublished.length).toBeGreaterThan(0);
    // NOW is Sunday 18 Oct: the week that closed on Friday 16 Oct is the newest one requested.
    expect(plan.pending.at(-1)!.key).toBe(fxcmKey(utc(2026, 10, 11)));
  });

  it("refuses unsupported instruments with an explanation", async () => {
    await expect(ensureProviderData({ ...REQ, symbol: "XAUUSD" }, noSleep)).rejects.toThrow(/not available/);
    const a = await checkAvailability({ ...REQ, symbol: "XAUUSD" }, { api: serverApi(fakeProviders().fetcher), nowSec: NOW });
    expect(a.supported).toBe(false);
    expect(a.reason).toMatch(/Import a CSV/);
  });
});

function fxcmKey(sunday: number) {
  const w = fxcmWeekOf(sunday);
  return `${w.year}-W${String(w.week).padStart(2, "0")}`;
}

describe.skipIf(!hasDb)("availability check", () => {
  beforeEach(resetReplayTables);

  it("clamps to the providers' coverage, estimates size and probes both ends", async () => {
    const { fetcher, calls } = fakeProviders({ missing: ["2026-W40"], exness: { missingMonths: ["2026-10"] } });
    const a = await checkAvailability({ ...REQ, fromT: utc(2010, 1, 1), toT: utc(2026, 10, 30) }, { api: serverApi(fetcher), nowSec: NOW });
    expect(a.supported).toBe(true);
    expect(a.fromT).toBe(utc(2012, 1, 1));
    expect(a.toT).toBe(utc(2026, 10, 16, 22)); // Friday close of the last finished week
    expect(a.warnings.join(" ")).toMatch(/starts in 2012/);
    expect(a.warnings.join(" ")).toMatch(/last finished trading week/);
    expect(a.warnings.join(" ")).not.toMatch(/No provider has week/);
    expect(calls.every((c) => c.includes("HEAD"))).toBe(true);
    expect(a.estimatedBytes).toBe(90_000 * a.chunksToDownload);
  });

  it("finds a week FXCM lacks at Exness when probing", async () => {
    const { fetcher } = fakeProviders({ emptyFile: ["2024-W11"] });
    const c = planFxcmChunks(utc(2024, 3, 12), utc(2024, 3, 13))[0];
    const p = await probeChunk({ symbol: "EURUSD", resolution: "M1", year: c.year, week: c.week, fromT: c.fromT }, fetcher);
    expect(p).toMatchObject({ status: "ok", source: "exness" });
  });
});

describe.skipIf(!hasDb)("server ingest", () => {
  beforeEach(resetReplayTables);

  it("rejects requests whose week doesn't match the date, and unsupported pairs", async () => {
    const { fetcher } = fakeProviders();
    const c = planFxcmChunks(utc(2024, 3, 5), utc(2024, 3, 6))[0];
    await expect(ingestChunk({ symbol: "EURUSD", resolution: "M1", year: c.year, week: c.week + 1, fromT: c.fromT }, { fetcher })).rejects.toThrow(/doesn't match/);
    await expect(ingestChunk({ symbol: "XAUUSD", resolution: "M1", year: c.year, week: c.week, fromT: c.fromT }, { fetcher })).rejects.toThrow(/not available/);
  });

  it("stores a week and its coverage atomically and changes nothing on re-ingest", async () => {
    const { fetcher } = fakeProviders();
    const c = planFxcmChunks(utc(2024, 3, 5), utc(2024, 3, 6))[0];
    const ref = { symbol: "EURUSD", resolution: "M1" as const, year: c.year, week: c.week, fromT: c.fromT };
    const a = await ingestChunk(ref, { fetcher });
    expect(a).toMatchObject({ status: "ok", source: "fxcm", candles: WEEK_MINUTES, added: WEEK_MINUTES, notes: [] });
    const before = (await getDataset(providerDatasetId(REQ)))!;
    const b = await ingestChunk(ref, { fetcher });
    expect(b).toMatchObject({ status: "ok", candles: WEEK_MINUTES, added: 0 });
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(ds.count).toBe(WEEK_MINUTES);
    expect(ds.version).toBe(before.version);
    expect(ds.months).toEqual(before.months); // month revisions unchanged: sessions see no "data changed" warning
    expect(ds.provider!.chunks[c.key]).toMatchObject({ status: "ok", n: WEEK_MINUTES });
  });

  it("builds H1 weeks from Exness ticks too", async () => {
    const { fetcher } = fakeProviders({ missing: ["2024-W10"] });
    const c = planFxcmChunks(utc(2024, 3, 5), utc(2024, 3, 6))[0];
    const r = await ingestChunk({ symbol: "EURUSD", resolution: "H1", year: c.year, week: c.week, fromT: c.fromT }, { fetcher });
    expect(r).toMatchObject({ status: "ok", source: "exness", candles: 120 });
    expect(r.notes).toEqual([{ source: "fxcm", reason: "has no file for this week" }]);
  });

  it("joins a week spanning two Exness months, and skips a month the week doesn't trade in", async () => {
    const weekOf = (sunday: number) => planFxcmChunks(sunday + 86_400, sunday + 2 * 86_400)[0];
    const across = weekOf(utc(2024, 3, 31)); // Sunday 31 March → Friday 5 April
    const endsOnFirst = weekOf(utc(2024, 11, 24)); // closes Friday 29 Nov; the window runs to Sunday 1 Dec
    const { fetcher, calls } = fakeProviders({ missing: [across.key, endsOnFirst.key] });
    const a = await ingestChunk({ symbol: "EURUSD", resolution: "M1", year: across.year, week: across.week, fromT: across.fromT }, { fetcher });
    expect(a).toMatchObject({ status: "ok", source: "exness", candles: WEEK_MINUTES });
    expect(calls.filter((x) => x.startsWith("EXNESS"))).toEqual(["EXNESS GET 2024-03", "EXNESS GET 2024-04"]);
    calls.length = 0;
    const b = await ingestChunk({ symbol: "EURUSD", resolution: "M1", year: endsOnFirst.year, week: endsOnFirst.week, fromT: endsOnFirst.fromT }, { fetcher });
    expect(b).toMatchObject({ status: "ok", source: "exness", candles: WEEK_MINUTES });
    expect(calls.filter((x) => x.startsWith("EXNESS"))).toEqual(["EXNESS GET 2024-11"]);
  });

  it("surfaces provider rate limits as retryable busy errors", async () => {
    const { fetcher } = fakeProviders({ retryAfter: { "2024-W10": 30 }, exness: { down: true } });
    const c = planFxcmChunks(utc(2024, 3, 5), utc(2024, 3, 6))[0];
    await expect(ingestChunk({ symbol: "EURUSD", resolution: "M1", year: c.year, week: c.week, fromT: c.fromT }, { fetcher })).rejects.toMatchObject({ retryAfterSec: 30 });
  });
});
