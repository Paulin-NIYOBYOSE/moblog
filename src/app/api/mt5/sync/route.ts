import { NextResponse } from "next/server";
import { parseMt5Payload } from "@/lib/mt5/deals";
import { accountForSyncKey, ingestMt5Payload, Mt5SyncError } from "@/lib/mt5/server";

export const dynamic = "force-dynamic";

// POST /api/mt5/sync -> deals from the MoblogSync expert advisor. Authenticated
// by the account's connection key (Authorization: Bearer mt5_…), not the
// session cookie — src/proxy.ts lets this path through.
export async function POST(request: Request) {
  const key = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  try {
    const account = await accountForSyncKey(key);
    if (!account) {
      return NextResponse.json(
        { error: "Unknown connection key. Generate a new one in Moblog (account > MT5 sync) and re-download the EA." },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }
    const parsed = parseMt5Payload(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await ingestMt5Payload(account, parsed.payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Mt5SyncError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/mt5/sync failed:", error);
    return NextResponse.json({ error: "Sync failed on the server." }, { status: 500 });
  }
}
