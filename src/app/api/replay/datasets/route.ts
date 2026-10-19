import { handle, json } from "@/lib/replay/server/http";
import { createDataset, listDatasets, StoreError } from "@/lib/replay/server/store";
import { TIMEFRAMES } from "@/lib/replay/time";
import type { Timeframe } from "@/lib/replay/types";

export const dynamic = "force-dynamic";

// GET /api/replay/datasets — every dataset with derived coverage
export async function GET() {
  return handle("GET /api/replay/datasets", async () => json(await listDatasets()));
}

// POST /api/replay/datasets — create an (empty) imported dataset
export async function POST(request: Request) {
  return handle("POST /api/replay/datasets", async () => {
    const b = await request.json();
    if (!TIMEFRAMES.includes(b.timeframe)) throw new StoreError("Unsupported timeframe.");
    const ds = await createDataset({
      name: String(b.name ?? ""),
      symbol: String(b.symbol ?? "").toUpperCase(),
      timeframe: b.timeframe as Timeframe,
      source: b.source,
      kind: "import",
      priceBasis: ["bid", "ask", "mid", "unknown"].includes(b.priceBasis) ? b.priceBasis : "unknown",
      sourceTimezone: String(b.sourceTimezone ?? "UTC"),
      hasSpread: Boolean(b.hasSpread),
      derivedFromTicks: Boolean(b.derivedFromTicks),
      quality: b.quality,
      files: [],
    });
    return json(ds, { status: 201 });
  });
}
