import { createNote, handle } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

// POST /api/notebook/notes {day, text} -> a note on that day
export async function POST(request: Request) {
  return handle("POST /api/notebook/notes", async () => createNote(await request.json()), 201);
}
