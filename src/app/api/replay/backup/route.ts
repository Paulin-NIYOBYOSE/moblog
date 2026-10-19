import { handle, json } from "@/lib/replay/server/http";
import { exportBackup, importBackup } from "@/lib/replay/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET ?candles=1 — JSON backup (imported candles optional; provider data can be re-downloaded)
export async function GET(request: Request) {
  return handle("GET backup", async () => {
    const candles = new URL(request.url).searchParams.get("candles") === "1";
    const file = await exportBackup(candles);
    return new Response(JSON.stringify(file), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="replay-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
}

// POST {file, overwrite} — restore (accepts v1 browser-era backups too)
export async function POST(request: Request) {
  return handle("POST backup", async () => {
    const b = await request.json();
    return json(await importBackup(b?.file, Boolean(b?.overwrite)));
  });
}
