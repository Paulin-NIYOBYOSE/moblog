import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import { ATTACHMENT_SELECT, badRequest, toTextOrNull, unauthorized } from "@/lib/server/parse";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/backtesting-v2/items/:id -> { completed?: boolean, notes?: string }
export async function PATCH(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) return unauthorized();
  try {
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.completed !== undefined) {
      if (typeof body.completed !== "boolean") return badRequest("completed must be a boolean.");
      data.completed = body.completed;
      data.completedAt = body.completed ? new Date() : null;
    }
    if (body.notes !== undefined) data.notes = toTextOrNull(body.notes);
    const item = await prisma.backtestV2Item.update({
      where: { id },
      data,
      include: { attachments: { select: ATTACHMENT_SELECT, orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error("PATCH /api/backtesting-v2/items/:id failed:", error);
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }
}
