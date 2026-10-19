import { handle, json } from "@/lib/replay/server/http";
import { pruneJournalEntries, setJournalEntry, StoreError } from "@/lib/replay/server/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// PUT {tradeId, entry|null} — save (or delete) one trade's journal entry
export async function PUT(request: Request, { params }: Ctx) {
  return handle("PUT journal", async () => {
    const b = await request.json();
    if (typeof b?.tradeId !== "string" || !b.tradeId) throw new StoreError("tradeId is required.");
    if (b.entry && JSON.stringify(b.entry).length > 3_000_000) throw new StoreError("Journal entry too large (screenshot over ~2 MB).", 413);
    await setJournalEntry((await params).id, b.tradeId, b.entry ?? null);
    return json({ ok: true });
  });
}

// POST {keep: string[]} — drop entries for trades that no longer exist
export async function POST(request: Request, { params }: Ctx) {
  return handle("POST journal prune", async () => {
    const b = await request.json();
    if (!Array.isArray(b?.keep)) throw new StoreError("keep must be a list of trade ids.");
    await pruneJournalEntries((await params).id, b.keep.map(String));
    return json({ ok: true });
  });
}
