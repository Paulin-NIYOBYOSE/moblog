import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import { journalData } from "@/lib/server/journalData";
import { ATTACHMENT_SELECT, badRequest, unauthorized } from "@/lib/server/parse";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PUT /api/journal/:id -> partial update
export async function PUT(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) return unauthorized();
  try {
    const { id } = await params;
    const parsed = await journalData(await request.json(), false);
    if ("error" in parsed) return badRequest(parsed.error);
    const entry = await prisma.journalEntry.update({
      where: { id },
      data: parsed.data as Prisma.JournalEntryUncheckedUpdateInput,
      include: { attachments: { select: ATTACHMENT_SELECT, orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json(entry);
  } catch (error) {
    console.error("PUT /api/journal/:id failed:", error);
    return NextResponse.json({ error: "Failed to update journal entry." }, { status: 500 });
  }
}

// DELETE /api/journal/:id (attachments cascade)
export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) return unauthorized();
  try {
    const { id } = await params;
    await prisma.journalEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/journal/:id failed:", error);
    return NextResponse.json({ error: "Failed to delete journal entry." }, { status: 500 });
  }
}
