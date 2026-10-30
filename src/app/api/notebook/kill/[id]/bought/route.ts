import { handle, markBought, undoBought } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/notebook/kill/:id/bought {day, paid, categoryId, useSavings} -> kill it and record the purchase
export async function PUT(request: Request, { params }: Params) {
  return handle("PUT /api/notebook/kill/:id/bought", async () => markBought((await params).id, await request.json()));
}

// DELETE /api/notebook/kill/:id/bought -> back on the list (purchase removed)
export async function DELETE(_request: Request, { params }: Params) {
  return handle("DELETE /api/notebook/kill/:id/bought", async () => undoBought((await params).id));
}
