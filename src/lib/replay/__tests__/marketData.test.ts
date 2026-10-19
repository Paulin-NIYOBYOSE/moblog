import { beforeEach, describe, expect, it } from "vitest";
import { checkAvailability, ensureProviderData, planRequest, providerDatasetId, ProviderUnavailableError, type DataRequest, type MarketDataApi } from "../marketData";
import { fxcmWeekOf, parseFxcmCsv, planFxcmChunks, weekSundayOf } from "../providers/fxcm";
import { ingestChunk, probeChunk, ProviderBusyError, type FileFetcher } from "../server/fxcmIngest";
import { getDataset, loadRange, StoreError } from "../server/store";
import { ApiError } from "../storage/repo";
import { fakeFxcm, fxcmFile, hasDb, resetReplayTables, utc } from "./dbHelpers";

const NOW = utc(2026, 10, 18, 12);

/**
 * The pipeline's API backed by the real server code (ingest + PostgreSQL)
 * and a fake FXCM. Errors are translated exactly as the HTTP layer does.
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
    ingest: (req, c, signal) => http(() => ingestChunk({ symbol: req.symbol, resolution: req.resolution, year: c.year, week: c.week, fromT: c.fromT }, fetcher), signal),
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


const REQ: DataRequest = { provider: "fxcm", symbol: "EURUSD", resolution: "M1", fromT: utc(2024, 3, 4), toT: utc(2024, 3, 29) };
const noSleep = { sleep: async () => undefined, nowSec: NOW };

describe.skipIf(!hasDb)("download pipeline (server ingest → PostgreSQL)", () => {
  beforeEach(resetReplayTables);

  it("downloads missing weeks, then reuses the cache on the next run", async () => {
    const { fetcher, calls } = fakeFxcm();
    const api = serverApi(fetcher);
    const stages: string[] = [];
    const r1 = await ensureProviderData(REQ, { api, ...noSleep, onProgress: (p) => stages.push(p.stage) });
    expect(r1.progress.chunksTotal).toBe(4);
    expect(r1.progress.chunksDone).toBe(4);
    expect(r1.progress.candlesDownloaded).toBe(1200);
    expect(stages).toContain("download");
    expect(stages).toContain("save");
    expect(stages.at(-1)).toBe("done");
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(ds.count).toBe(1200);
    expect(ds.hasSpread).toBe(true);
    expect(Object.keys(ds.provider!.chunks)).toHaveLength(4);
    const bars = await loadRange(ds.id, ds.firstT, ds.lastT);
    expect(bars.n).toBe(1200);
    expect(bars.sp![0]).toBeCloseTo(0.0001, 9);
    // Week W10 opens Sunday 22:00, two hours before the requested Monday start.
    expect((await loadRange(ds.id, REQ.fromT, REQ.toT)).n).toBe(1080);
    for (let i = 1; i < bars.n; i++) expect(bars.t[i]).toBeGreaterThan(bars.t[i - 1]);

    calls.length = 0;
    const r2 = await ensureProviderData(REQ, { api, ...noSleep });
    expect(calls).toEqual([]); // nothing re-downloaded
    expect(r2.progress.chunksCached).toBe(4);
    expect(r2.progress.candlesCached).toBe(1200);

    // Extending the range downloads only the new week.
    calls.length = 0;
    await ensureProviderData({ ...REQ, toT: utc(2024, 4, 5) }, { api, ...noSleep });
    expect(calls.filter((c) => c.startsWith("GET"))).toEqual(["GET 2024-W14"]);
  });

  it("retries transient errors with backoff and honours Retry-After", async () => {
    const { fetcher } = fakeFxcm({ failFirst: { "2024-W11": 2 }, retryAfter: { "2024-W12": 7 } });
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
    expect(retries).toEqual(expect.arrayContaining(["2024-W11#1", "2024-W11#2", "2024-W12#1"]));
    expect(waits).toEqual(expect.arrayContaining([1000, 2000, 7000])); // backoff + Retry-After
  });

  it("gives up after bounded attempts with a clear error, keeping finished weeks", async () => {
    const { fetcher } = fakeFxcm({ failFirst: { "2024-W13": 99 } });
    await expect(ensureProviderData(REQ, { api: serverApi(fetcher), ...noSleep, concurrency: 1, maxAttempts: 3 })).rejects.toThrow(ProviderUnavailableError);
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(Object.keys(ds.provider!.chunks).sort()).toEqual(["2024-W10", "2024-W11", "2024-W12"]);
  });

  it("reports weeks the provider doesn't have instead of inventing them", async () => {
    const { fetcher } = fakeFxcm({ missing: ["2024-W11"] });
    const r = await ensureProviderData(REQ, { api: serverApi(fetcher), ...noSleep });
    expect(r.missing).toEqual(["2024-W11"]);
    expect(r.progress.chunksMissing).toBe(1);
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(ds.provider!.chunks["2024-W11"].status).toBe("missing");
    expect(ds.count).toBe(900);
    // Old missing weeks aren't re-requested on every run.
    const plan = planRequest(REQ, ds, NOW);
    expect(plan.knownMissing.map((c) => c.key)).toEqual(["2024-W11"]);
    expect(plan.pending).toHaveLength(0);
  });

  it("can be cancelled and resumes without re-downloading", async () => {
    const { fetcher, calls } = fakeFxcm();
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
    expect(calls.filter((c) => c.startsWith("GET")).length).toBe(4 - kept.length);
  });

  it("skips weeks that can't have been published yet", () => {
    const plan = planRequest({ ...REQ, fromT: utc(2026, 9, 20), toT: utc(2026, 10, 30) }, undefined, NOW);
    expect(plan.unpublished.length).toBeGreaterThan(0);
    expect(plan.pending.every((c) => c.fromT < NOW - 5 * 86_400)).toBe(true);
  });

  it("refuses unsupported instruments with an explanation", async () => {
    await expect(ensureProviderData({ ...REQ, symbol: "XAUUSD" }, noSleep)).rejects.toThrow(/not available/);
    const a = await checkAvailability({ ...REQ, symbol: "XAUUSD" }, { api: serverApi(fakeFxcm().fetcher), nowSec: NOW });
    expect(a.supported).toBe(false);
    expect(a.reason).toMatch(/Import a CSV/);
  });
});

describe.skipIf(!hasDb)("availability check", () => {
  beforeEach(resetReplayTables);

  it("clamps to the provider's coverage, estimates size and probes both ends", async () => {
    const { fetcher, calls } = fakeFxcm({ missing: ["2026-W40"] });
    const a = await checkAvailability({ ...REQ, fromT: utc(2010, 1, 1), toT: utc(2026, 10, 17) }, { api: serverApi(fetcher), nowSec: NOW });
    expect(a.supported).toBe(true);
    expect(a.fromT).toBe(utc(2012, 1, 1));
    expect(a.toT).toBeLessThan(utc(2026, 10, 17));
    expect(a.warnings.join(" ")).toMatch(/starts in 2012/);
    expect(a.warnings.join(" ")).toMatch(/delay/);
    expect(calls.every((c) => c.startsWith("HEAD"))).toBe(true);
    expect(a.estimatedBytes).toBe(90_000 * a.chunksToDownload);
  });
});

describe.skipIf(!hasDb)("server ingest", () => {
  beforeEach(resetReplayTables);

  it("rejects requests whose week doesn't match the date, and unsupported pairs", async () => {
    const { fetcher } = fakeFxcm();
    const c = planFxcmChunks(utc(2024, 3, 5), utc(2024, 3, 6))[0];
    await expect(ingestChunk({ symbol: "EURUSD", resolution: "M1", year: c.year, week: c.week + 1, fromT: c.fromT }, fetcher)).rejects.toThrow(/doesn't match/);
    await expect(ingestChunk({ symbol: "XAUUSD", resolution: "M1", year: c.year, week: c.week, fromT: c.fromT }, fetcher)).rejects.toThrow(/not available/);
  });

  it("stores a week and its coverage atomically and never duplicates candles on re-ingest", async () => {
    const { fetcher } = fakeFxcm();
    const c = planFxcmChunks(utc(2024, 3, 5), utc(2024, 3, 6))[0];
    const ref = { symbol: "EURUSD", resolution: "M1" as const, year: c.year, week: c.week, fromT: c.fromT };
    const a = await ingestChunk(ref, fetcher);
    expect(a).toMatchObject({ status: "ok", candles: 300, added: 300 });
    const b = await ingestChunk(ref, fetcher);
    expect(b).toMatchObject({ status: "ok", candles: 300, added: 0 });
    const ds = (await getDataset(providerDatasetId(REQ)))!;
    expect(ds.count).toBe(300);
    expect(ds.provider!.chunks[c.key]).toMatchObject({ status: "ok", n: 300 });
  });

  it("surfaces provider rate limits as retryable busy errors", async () => {
    const { fetcher } = fakeFxcm({ retryAfter: { "2024-W10": 30 } });
    const c = planFxcmChunks(utc(2024, 3, 5), utc(2024, 3, 6))[0];
    await expect(ingestChunk({ symbol: "EURUSD", resolution: "M1", year: c.year, week: c.week, fromT: c.fromT }, fetcher)).rejects.toMatchObject({ retryAfterSec: 30 });
  });
});
