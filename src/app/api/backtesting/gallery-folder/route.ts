import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/serverAuth";
import { findGalleryFolderId, resolveGalleryFolderId } from "@/lib/backtestingServer";
import { isGalleryTarget } from "@/lib/backtesting";

export const dynamic = "force-dynamic";

/** A gallery target is a pair name (e.g. "EURUSD") or "Overall". */
function parseTarget(raw: string): { error: string } | { target: string } {
  if (!isGalleryTarget(raw)) return { error: "Unknown gallery target." };
  return { target: raw };
}

// GET /api/backtesting/gallery-folder?target=EURUSD
// Read-only: returns { folderId: string | null }. Browsing a target that has
// no screenshots yet must not create anything.
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseTarget(searchParams.get("target") ?? "");
    if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });

    const folderId = await findGalleryFolderId(parsed.target);
    return NextResponse.json({ folderId });
  } catch (error) {
    console.error("GET /api/backtesting/gallery-folder failed:", error);
    return NextResponse.json({ error: "Failed to load gallery folder." }, { status: 500 });
  }
}

// POST /api/backtesting/gallery-folder -> { target }
// Find-or-create; called just before an upload so the folder exists to receive
// it. Returns { folderId } for the existing /api/media/images upload flow.
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const parsed = parseTarget(String(body.target ?? ""));
    if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });

    const folderId = await resolveGalleryFolderId(parsed.target);
    return NextResponse.json({ folderId });
  } catch (error) {
    console.error("POST /api/backtesting/gallery-folder failed:", error);
    return NextResponse.json({ error: "Failed to resolve gallery folder." }, { status: 500 });
  }
}
