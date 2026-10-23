import { beforeAll, describe, expect, it } from "vitest";
import { planFxcmChunks } from "../providers/fxcm";
import { ingestChunk } from "../server/ingest";
import type { Timeframe } from "../types";
import { hasDb, resetReplayTables, utc } from "./dbHelpers";

// Downloads real weeks from FXCM and Exness (about 50 MB). Opt-in:
//   REPLAY_REAL_DATA=1 npx vitest run src/lib/replay/__tests__/realData.test.ts
// The weeks are real holes in FXCM's archive, as checked in October 2026.

const live = process.env.REPLAY_REAL_DATA === "1";

async function ingest(symbol: string, resolution: Timeframe, dayInWeek: number) {
  const c = planFxcmChunks(dayInWeek, dayInWeek + 3600)[0];
  return ingestChunk({ symbol, resolution, year: c.year, week: c.week, fromT: c.fromT });
}

describe.skipIf(!hasDb || !live)("real archives", () => {
  beforeAll(resetReplayTables);

  it("stores a normal week from FXCM", async () => {
    const r = await ingest("EURUSD", "M1", utc(2024, 3, 5));
    expect(r).toMatchObject({ key: "2024-W10", status: "ok", source: "fxcm" });
    expect(r.candles).toBeGreaterThan(7000);
  }, 120_000);

  it("fills AUDCAD 2024-W51, a 0-byte FXCM file, from Exness", async () => {
    const r = await ingest("AUDCAD", "M1", utc(2024, 12, 17));
    expect(r).toMatchObject({ key: "2024-W51", status: "ok", source: "exness" });
    expect(r.notes).toEqual([{ source: "fxcm", reason: "published an empty file for this week" }]);
    expect(r.candles).toBeGreaterThan(7000);
  }, 120_000);

  it("replaces EURUSD 2025-W26, an FXCM file cut off after a few hours", async () => {
    const r = await ingest("EURUSD", "M1", utc(2025, 6, 24));
    expect(r).toMatchObject({ key: "2025-W26", status: "ok", source: "exness" });
    expect(r.notes[0].reason).toMatch(/has only \d+ candles/);
  }, 120_000);

  it("fills EURUSD 2026-W20, inside FXCM's 14-week hole of 2026", async () => {
    const r = await ingest("EURUSD", "M1", utc(2026, 5, 12));
    expect(r).toMatchObject({ status: "ok", source: "exness" });
  }, 120_000);

  it("keeps the fullest holiday week when no provider has all of it (AUDCAD H1 2024-W52)", async () => {
    const r = await ingest("AUDCAD", "H1", utc(2024, 12, 24));
    expect(r).toMatchObject({ key: "2024-W52", status: "partial", source: "exness" });
    expect(r.candles).toBeGreaterThan(80);
  }, 120_000);
});
