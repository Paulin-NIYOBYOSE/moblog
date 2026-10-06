import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import { journalData } from "@/lib/server/journalData";
import { ATTACHMENT_SELECT, badRequest, unauthorized } from "@/lib/server/parse";

export const dynamic = "force-dynamic";

// GET /api/journal -> every entry, newest day first, with attachment metadata
export async function GET() {
  if (!(await isAuthenticated())) return unauthorized();
  try {
    const entries = await prisma.journalEntry.findMany({
      orderBy: [{ day: "desc" }, { createdAt: "desc" }],
      include: { attachments: { select: ATTACHMENT_SELECT, orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json(entries);
  } catch (error) {
    console.error("GET /api/journal failed:", error);
    return NextResponse.json({ error: "Failed to load journal." }, { status: 500 });
  }
}

// POST /api/journal -> create an entry
export async function POST(request: Request) {
  if (!(await isAuthenticated())) return unauthorized();
  try {
    const parsed = await journalData(await request.json(), true);
    if ("error" in parsed) return badRequest(parsed.error);
    const entry = await prisma.journalEntry.create({
      data: parsed.data as Prisma.JournalEntryUncheckedCreateInput,
      include: { attachments: { select: ATTACHMENT_SELECT } },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST /api/journal failed:", error);
    return NextResponse.json({ error: "Failed to create journal entry." }, { status: 500 });
  }
}
