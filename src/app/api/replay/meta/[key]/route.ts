import { handle, json } from "@/lib/replay/server/http";
import { getMeta, setMeta, StoreError } from "@/lib/replay/server/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ key: string }> };

const KEYS = new Set(["strategies", "instrumentPrefs", "preferences"]);

export async function GET(_req: Request, { params }: Ctx) {
  return handle("GET meta", async () => {
    const { key } = await params;
    if (!KEYS.has(key)) throw new StoreError("Unknown setting.", 404);
    return json({ value: await getMeta(key, null) });
  });
}

export async function PUT(request: Request, { params }: Ctx) {
  return handle("PUT meta", async () => {
    const { key } = await params;
    if (!KEYS.has(key)) throw new StoreError("Unknown setting.", 404);
    const b = await request.json();
    if (JSON.stringify(b?.value ?? null).length > 500_000) throw new StoreError("Setting too large.", 413);
    await setMeta(key, b?.value ?? null);
    return json({ ok: true });
  });
}
