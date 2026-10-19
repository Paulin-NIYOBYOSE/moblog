import { handle, json } from "@/lib/replay/server/http";
import { deleteSession, getSession, patchSession, saveSession, StoreError } from "@/lib/replay/server/store";
import type { ReplaySession } from "@/lib/replay/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle("GET session", async () => {
    const s = await getSession((await params).id);
    if (!s) throw new StoreError("Session not found — it may have been deleted.", 404);
    return json(s);
  });
}

// PUT {session, baseRevision} — atomic full save; 409 if someone else saved first
export async function PUT(request: Request, { params }: Ctx) {
  return handle("PUT session", async () => {
    const { id } = await params;
    const b = (await request.json()) as { session: ReplaySession; baseRevision: number };
    if (!b?.session || b.session.id !== id || !Number.isInteger(b.baseRevision)) throw new StoreError("Invalid save request.");
    return json(await saveSession(b.session, b.baseRevision));
  });
}

// PATCH {name?, favorite?, archived?, tags?, strategy?, notes?, description?}
export async function PATCH(request: Request, { params }: Ctx) {
  return handle("PATCH session", async () => json(await patchSession((await params).id, await request.json())));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle("DELETE session", async () => {
    await deleteSession((await params).id);
    return json({ ok: true });
  });
}
