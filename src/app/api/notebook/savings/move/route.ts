import { handle, moveSavings } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

// POST /api/notebook/savings/move {day, amount, from: {killItemId}, to: {killItemId?}} — {} = general savings
export async function POST(request: Request) {
  return handle("POST /api/notebook/savings/move", async () => moveSavings(await request.json()), 201);
}
