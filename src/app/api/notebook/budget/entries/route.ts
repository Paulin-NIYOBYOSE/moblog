import { createEntry, handle } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

// POST /api/notebook/budget/entries {day, kind, amount, categoryId, note, killItemId}
export async function POST(request: Request) {
  return handle("POST /api/notebook/budget/entries", async () => createEntry(await request.json()), 201);
}
