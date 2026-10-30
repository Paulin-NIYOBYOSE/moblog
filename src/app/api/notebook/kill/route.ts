import { createKillItem, handle } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

// POST /api/notebook/kill {name, price, targetMonth, link, notes} -> added at the end of the list
export async function POST(request: Request) {
  return handle("POST /api/notebook/kill", async () => createKillItem(await request.json()), 201);
}
