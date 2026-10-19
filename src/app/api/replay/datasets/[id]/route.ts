import { handle, json } from "@/lib/replay/server/http";
import { deleteDataset, getDataset, StoreError, updateDatasetMeta } from "@/lib/replay/server/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle("GET dataset", async () => {
    const ds = await getDataset((await params).id);
    if (!ds) throw new StoreError("Dataset not found — it may have been deleted.", 404);
    return json(ds);
  });
}

// PATCH — rename, or record an imported file (name/size/rows) and its quality report
export async function PATCH(request: Request, { params }: Ctx) {
  return handle("PATCH dataset", async () => {
    const { id } = await params;
    const b = await request.json();
    await updateDatasetMeta(id, { name: b.name, addFile: b.addFile, mergeQuality: b.mergeQuality, hasSpread: b.hasSpread });
    return json(await getDataset(id));
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle("DELETE dataset", async () => {
    await deleteDataset((await params).id);
    return json({ ok: true });
  });
}
