import { handle, reorderKillItems } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

// PUT /api/notebook/kill/order {ids} -> new priority order (first = the item you are targeting)
export async function PUT(request: Request) {
  return handle("PUT /api/notebook/kill/order", async () => reorderKillItems(await request.json()));
}
