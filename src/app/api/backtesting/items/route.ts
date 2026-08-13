import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import { ensureBacktestItemsSeeded } from "@/lib/backtestingServer";

export const dynamic = "force-dynamic";

// GET /api/backtesting/items -> all 168 (instrument, year) rows, seeding on first call.
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureBacktestItemsSeeded();
    const items = await prisma.backtestItem.findMany({ orderBy: { sequence: "asc" } });
    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/backtesting/items failed:", error);
    return NextResponse.json({ error: "Failed to load backtesting progress." }, { status: 500 });
  }
}
