import { handle, json, num } from "@/lib/replay/server/http";
import { ingestChunk, probeChunk, type ChunkRef } from "@/lib/replay/server/ingest";
import type { Timeframe } from "@/lib/replay/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function ref(symbol: unknown, res: unknown, year: unknown, week: unknown, fromT: unknown): ChunkRef {
  return { symbol: String(symbol ?? ""), resolution: (res === "H1" ? "H1" : "M1") as Timeframe, year: Number(year), week: Number(week), fromT: Number(fromT) };
}

// GET ?symbol&res&year&week&from — does a provider have this trading week? (HEAD, nothing stored)
export async function GET(request: Request) {
  return handle("GET history probe", async () => {
    const u = new URL(request.url);
    const p = u.searchParams;
    return json(await probeChunk(ref(p.get("symbol"), p.get("res"), num(p.get("year")), num(p.get("week")), num(p.get("from")))));
  });
}

// POST {symbol,res,year,week,fromT,final} — download one week (FXCM, else Exness), validate it and store it in the database
export async function POST(request: Request) {
  return handle("POST history ingest", async () => {
    const b = await request.json();
    return json(await ingestChunk(ref(b.symbol, b.res, b.year, b.week, b.fromT), { final: b.final === true }));
  });
}
