import { handle, loadNotebook } from "@/lib/server/notebook";

export const dynamic = "force-dynamic";

// GET /api/notebook -> settings, kill list, savings goals, budget and notes
export async function GET() {
  return handle("GET /api/notebook", loadNotebook);
}
