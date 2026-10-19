import { DB_NAME, getAll, STORES } from "./db";
import type { DatasetMeta, MonthChunk, ReplaySession } from "../types";

// Earlier versions of Replay kept everything in this browser's IndexedDB.
// This reads that data once, as a v1 backup the server can import, so moving
// to the database loses nothing. Nothing here writes to IndexedDB.

export async function legacyInventory(): Promise<{ sessions: number; datasets: number } | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    // indexedDB.databases() isn't everywhere; fall back to opening (creates an empty DB if absent).
    if ("databases" in indexedDB) {
      const dbs = await indexedDB.databases();
      if (!dbs.some((d) => d.name === DB_NAME)) return null;
    }
    const [sessions, datasets] = await Promise.all([getAll<ReplaySession>(STORES.sessions), getAll<DatasetMeta>(STORES.datasets)]);
    if (!sessions.length && !datasets.length) return null;
    return { sessions: sessions.length, datasets: datasets.length };
  } catch {
    return null;
  }
}

export async function readLegacyBackup() {
  const [datasets, sessions, meta, chunks] = await Promise.all([
    getAll<DatasetMeta>(STORES.datasets),
    getAll<ReplaySession>(STORES.sessions),
    getAll<{ key: string; value: unknown }>(STORES.meta),
    getAll<MonthChunk>(STORES.chunks),
  ]);
  return {
    format: "moblog-replay-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    datasets,
    sessions,
    meta,
    chunks: chunks.map((c) => ({
      datasetId: c.datasetId,
      month: c.month,
      bars: {
        t: Array.from(c.bars.t),
        o: Array.from(c.bars.o),
        h: Array.from(c.bars.h),
        l: Array.from(c.bars.l),
        c: Array.from(c.bars.c),
        v: Array.from(c.bars.v),
        sp: c.bars.sp ? Array.from(c.bars.sp, (x) => (Number.isFinite(x) ? x : null)) : null,
      },
    })),
  };
}

/** Delete the old browser database after a successful move. */
export function deleteLegacyData(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
