import { handle, json } from "@/lib/replay/server/http";
import { createSession, listSessions, StoreError, type SessionView } from "@/lib/replay/server/store";
import type { ReplaySession } from "@/lib/replay/types";

export const dynamic = "force-dynamic";

// GET ?view=summary|analytics — sessions without heavy fields (no commands/drawings/screenshots)
export async function GET(request: Request) {
  return handle("GET sessions", async () => {
    const v = new URL(request.url).searchParams.get("view");
    const view: SessionView = v === "analytics" ? "analytics" : "summary";
    return json(await listSessions(view));
  });
}

// POST — create a session (full state)
export async function POST(request: Request) {
  return handle("POST sessions", async () => {
    const s = (await request.json()) as ReplaySession;
    if (!s?.id || !s.settings || !s.datasetId || !Array.isArray(s.commands)) throw new StoreError("Invalid session.");
    return json(await createSession(s), { status: 201 });
  });
}
