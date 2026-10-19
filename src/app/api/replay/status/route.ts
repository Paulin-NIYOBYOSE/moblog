import { handle, json } from "@/lib/replay/server/http";
import { storageStatus } from "@/lib/replay/server/store";

export const dynamic = "force-dynamic";

// GET — database usage of Replay's tables (for the storage indicator)
export async function GET() {
  return handle("GET replay status", async () => json({ storage: await storageStatus(), database: "postgresql" }));
}
