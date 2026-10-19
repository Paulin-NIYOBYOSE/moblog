import { handle, json } from "@/lib/replay/server/http";
import { analyseGaps } from "@/lib/replay/csv";
import { loadRange, StoreError } from "@/lib/replay/server/store";
import { emptyQuality } from "@/lib/replay/server/store";
import { TIMEFRAMES } from "@/lib/replay/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST {datasetId, fromT, toT, timeframe} — gap/coverage check of a range (read-only)
export async function POST(request: Request) {
  return handle("POST validate", async () => {
    const b = await request.json();
    if (!TIMEFRAMES.includes(b.timeframe)) throw new StoreError("Unsupported timeframe.");
    const fromT = Number(b.fromT);
    const toT = Number(b.toT);
    if (!(toT > fromT) || toT - fromT > 6 * 366 * 86_400) throw new StoreError("Range must be positive and at most 6 years.");
    const bars = await loadRange(String(b.datasetId), fromT, toT);
    const q = emptyQuality();
    analyseGaps(bars, b.timeframe, q);
    return json({ bars: bars.n, firstT: bars.n ? bars.t[0] : null, lastT: bars.n ? bars.t[bars.n - 1] : null, gapCount: q.gapCount, largeGaps: q.largeGaps, weekendGaps: q.weekendGaps, misaligned: q.misaligned });
  });
}
