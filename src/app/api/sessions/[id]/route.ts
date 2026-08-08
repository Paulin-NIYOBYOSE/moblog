import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.pair !== undefined) data.pair = String(body.pair).trim().toUpperCase();
    if (body.currency !== undefined)
      data.currency = String(body.currency).trim().toUpperCase().slice(0, 3);
    if (body.startingBalance !== undefined)
      data.startingBalance = Number(body.startingBalance) || 0;
    if (body.strategy !== undefined)
      data.strategy = body.strategy ? String(body.strategy).trim() : null;
    if (body.tags !== undefined)
      data.tags = Array.isArray(body.tags)
        ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
        : [];
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
    if (body.isArchived !== undefined) data.isArchived = Boolean(body.isArchived);

    const session = await prisma.session.update({ where: { id }, data });
    return NextResponse.json(session);
  } catch (error) {
    console.error("PUT /api/sessions/:id failed:", error);
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await prisma.session.delete({ where: { id } }); // cascades to backtest trades
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/sessions/:id failed:", error);
    return NextResponse.json({ error: "Failed to delete session." }, { status: 500 });
  }
}
