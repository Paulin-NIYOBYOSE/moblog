import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthenticated } from "@/lib/serverAuth";
import { ProviderBusyError } from "./fxcmIngest";
import { StoreError } from "./store";

/** Run a Replay API handler: auth check + consistent JSON errors. */
export async function handle(label: string, fn: () => Promise<Response>): Promise<Response> {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
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
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022")) {
      return NextResponse.json(
        { error: "Replay's database tables don't exist yet. Run `npx prisma migrate deploy` (or `npm run db:deploy`) against your database, then reload.", setup: true },
        { status: 503 },
      );
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
