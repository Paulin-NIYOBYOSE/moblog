import zlib from "node:zlib";
import { handle, json, num } from "@/lib/replay/server/http";
import { loadHourlyPacked, loadRangePacked, StoreError, writeBars } from "@/lib/replay/server/store";
import { unpackBars } from "@/lib/replay/pack";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// GET ?from&to[&tf=H1] — packed candles (see lib/replay/pack.ts), gzip-encoded.
// tf=H1 aggregates on the server (older chart history), up to a year per call.
export async function GET(request: Request, { params }: Ctx) {
  return handle("GET candles", async () => {
    const u = new URL(request.url);
    const from = num(u.searchParams.get("from"));
    const to = num(u.searchParams.get("to"));
    const tf = u.searchParams.get("tf");
    if (tf !== null && tf !== "H1") throw new StoreError("Only tf=H1 is supported.");
    const maxDays = tf ? 370 : 40;
    if (!(to >= from) || to - from > maxDays * 86_400) throw new StoreError(`Request at most ${maxDays} days of candles per call.`);
    const id = (await params).id;
    const { buffer, days, bars } = tf ? { ...(await loadHourlyPacked(id, from, to)), days: 0 } : await loadRangePacked(id, from, to);
    const body = zlib.gzipSync(buffer, { level: 1 });
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "gzip",
        "Cache-Control": "private, no-store",
        "X-Replay-Days": String(days),
        "X-Replay-Bars": String(bars),
      },
    });
  });
}

// PUT — append imported candles (body: gzip of a pack); existing candles win on equal timestamps
export async function PUT(request: Request, { params }: Ctx) {
  return handle("PUT candles", async () => {
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.byteLength > 32 * 1024 * 1024) throw new StoreError("Upload too large — send at most a month of candles per request.", 413);
    let packed: Buffer;
    try {
      packed = zlib.gunzipSync(raw);
    } catch {
      throw new StoreError("Upload must be gzip-compressed candle data.");
    }
    const bars = unpackBars(new Uint8Array(packed));
    for (let i = 0; i < bars.n; i++) {
      const ok = bars.o[i] > 0 && bars.l[i] > 0 && bars.h[i] >= Math.max(bars.o[i], bars.c[i]) && bars.l[i] <= Math.min(bars.o[i], bars.c[i]) && (i === 0 || bars.t[i] > bars.t[i - 1]);
      if (!ok) throw new StoreError(`Rejected upload: invalid or unsorted candle at index ${i}.`);
    }
    return json(await writeBars((await params).id, bars));
  });
}
