import { deleteNote, handle, updateNote } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/notebook/notes/:id {text?, done?, day?} -> partial update
export async function PUT(request: Request, { params }: Params) {
  return handle("PUT /api/notebook/notes/:id", async () => updateNote((await params).id, await request.json()));
}

// DELETE /api/notebook/notes/:id
export async function DELETE(_request: Request, { params }: Params) {
  return handle("DELETE /api/notebook/notes/:id", async () => deleteNote((await params).id));
}
