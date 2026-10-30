import { deleteEntry, handle, updateEntry } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/notebook/budget/entries/:id -> partial update
export async function PUT(request: Request, { params }: Params) {
  return handle("PUT /api/notebook/budget/entries/:id", async () => updateEntry((await params).id, await request.json()));
}

// DELETE /api/notebook/budget/entries/:id
export async function DELETE(_request: Request, { params }: Params) {
  return handle("DELETE /api/notebook/budget/entries/:id", async () => deleteEntry((await params).id));
}
