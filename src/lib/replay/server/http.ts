import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import { ProviderBusyError } from "./ingest";
import { StoreError } from "./store";

const NO_TABLES = "Replay's database tables don't exist yet. Run `npx prisma migrate deploy` (or `npm run db:deploy`) against your database, then reload.";

/** Run a Replay API handler: auth check + consistent JSON errors. */
export async function handle(label: string, fn: () => Promise<Response>): Promise<Response> {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // A dev server started before `prisma generate` keeps the old client in memory, without Replay's models.
  if ((prisma as unknown as Record<string, unknown>).replaySession === undefined) {
    return NextResponse.json({ error: "The server's Prisma client is older than Replay's database models. Run `npx prisma generate` and restart the server.", setup: true }, { status: 503 });
  }
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ProviderBusyError) {
      return NextResponse.json(
        { error: e.message, busy: true, retryAfter: e.retryAfterSec },
        { status: 503, headers: e.retryAfterSec ? { "Retry-After": String(e.retryAfterSec) } : undefined },
      );
    }
    if (e instanceof StoreError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      // P2021/P2022: missing table/column; P2010 + 42P01: a raw query hit a missing table.
      const missing = e.code === "P2021" || e.code === "P2022" || (e.code === "P2010" && (e.meta as { code?: string } | undefined)?.code === "42P01");
      if (missing) return NextResponse.json({ error: NO_TABLES, setup: true }, { status: 503 });
      // P1001: server unreachable; P2024: no free connection in time (e.g. a serverless database waking up).
      if (e.code === "P1001" || e.code === "P2024") {
        return NextResponse.json({ error: "The database didn't respond in time — it may be waking up. Try again in a few seconds." }, { status: 503, headers: { "Retry-After": "5" } });
      }
    }
    if (e instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "The database couldn't be reached. Check DATABASE_URL and that the database is running." }, { status: 503 });
    }
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
    console.error(`${label} failed:`, e);
    return NextResponse.json({ error: "Something went wrong on the server — see the server log." }, { status: 500 });
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function num(v: string | null): number {
  const n = Number(v);
  if (v === null || !Number.isFinite(n)) throw new StoreError("Missing or invalid number parameter.");
  return n;
}
