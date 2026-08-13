import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/serverAuth";
import { resolveGalleryFolderId } from "@/lib/backtestingServer";
import { INSTRUMENTS, YEARS } from "@/lib/backtesting";

export const dynamic = "force-dynamic";

// POST /api/backtesting/gallery-folder -> { instrument, year } finds (or
// lazily creates) the matching folder in the existing media gallery and
// returns its id, so uploads/browsing reuse /api/media/images as-is.
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const instrument = String(body.instrument ?? "");
    const year = Number(body.year);
    if (!(INSTRUMENTS as readonly string[]).includes(instrument)) {
      return NextResponse.json({ error: "Unknown instrument." }, { status: 400 });
    }
    if (!(YEARS as readonly number[]).includes(year)) {
      return NextResponse.json({ error: "Unknown year." }, { status: 400 });
    }
    const folderId = await resolveGalleryFolderId(instrument, year);
    return NextResponse.json({ folderId });
  } catch (error) {
    console.error("POST /api/backtesting/gallery-folder failed:", error);
    return NextResponse.json({ error: "Failed to resolve gallery folder." }, { status: 500 });
  }
}
