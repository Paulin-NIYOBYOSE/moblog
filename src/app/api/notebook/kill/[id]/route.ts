import { deleteKillItem, handle, updateKillItem } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/notebook/kill/:id -> partial update
export async function PUT(request: Request, { params }: Params) {
  return handle("PUT /api/notebook/kill/:id", async () => updateKillItem((await params).id, await request.json()));
}

// DELETE /api/notebook/kill/:id
export async function DELETE(_request: Request, { params }: Params) {
  return handle("DELETE /api/notebook/kill/:id", async () => deleteKillItem((await params).id));
}
