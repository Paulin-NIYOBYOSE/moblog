import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/serverAuth";
import { findGalleryFolderId, resolveGalleryFolderId } from "@/lib/backtestingServer";
import { INSTRUMENTS, YEARS } from "@/lib/backtesting";

export const dynamic = "force-dynamic";

/** Validates ?instrument=&year= (GET) or the JSON body (POST). */
function parsePair(instrument: string, year: number): { error: string } | { instrument: string; year: number } {
  if (!(INSTRUMENTS as readonly string[]).includes(instrument)) return { error: "Unknown instrument." };
  if (!(YEARS as readonly number[]).includes(year)) return { error: "Unknown year." };
  return { instrument, year };
}

// GET /api/backtesting/gallery-folder?instrument=EURUSD&year=2022
// Read-only: returns { folderId: string | null }. Browsing a pair-year that
// has no screenshots yet must not create anything.
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parsePair(searchParams.get("instrument") ?? "", Number(searchParams.get("year")));
    if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });

    const folderId = await findGalleryFolderId(parsed.instrument, parsed.year);
    return NextResponse.json({ folderId });
  } catch (error) {
    console.error("GET /api/backtesting/gallery-folder failed:", error);
    return NextResponse.json({ error: "Failed to load gallery folder." }, { status: 500 });
  }
}

// POST /api/backtesting/gallery-folder -> { instrument, year }
// Find-or-create; called just before an upload so the folder exists to receive
// it. Returns { folderId } for the existing /api/media/images upload flow.
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const parsed = parsePair(String(body.instrument ?? ""), Number(body.year));
    if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });

    const folderId = await resolveGalleryFolderId(parsed.instrument, parsed.year);
    return NextResponse.json({ folderId });
  } catch (error) {
    console.error("POST /api/backtesting/gallery-folder failed:", error);
    return NextResponse.json({ error: "Failed to resolve gallery folder." }, { status: 500 });
  }
}
