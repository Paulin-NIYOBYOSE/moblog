import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import { ensureV2ItemsSeeded } from "@/lib/server/backtestV2Server";
import { ATTACHMENT_SELECT, unauthorized } from "@/lib/server/parse";

export const dynamic = "force-dynamic";

// GET /api/backtesting-v2/items -> the 56 pair-year sessions, seeding on first call
export async function GET() {
  if (!(await isAuthenticated())) return unauthorized();
  try {
    await ensureV2ItemsSeeded();
    const items = await prisma.backtestV2Item.findMany({
      orderBy: { sequence: "asc" },
      include: { attachments: { select: ATTACHMENT_SELECT, orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/backtesting-v2/items failed:", error);
    return NextResponse.json({ error: "Failed to load Backtesting v2 plan." }, { status: 500 });
  }
}
