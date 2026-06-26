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
    if (body.currency !== undefined)
      data.currency = String(body.currency).trim().toUpperCase().slice(0, 3);
    if (body.startingBalance !== undefined)
      data.startingBalance = Number(body.startingBalance) || 0;
    if (body.isArchived !== undefined) data.isArchived = Boolean(body.isArchived);

    const account = await prisma.account.update({ where: { id }, data });
    return NextResponse.json(account);
  } catch (error) {
    console.error("PUT /api/accounts/:id failed:", error);
    return NextResponse.json({ error: "Failed to update account." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await prisma.account.delete({ where: { id } }); // cascades to trades
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/accounts/:id failed:", error);
    return NextResponse.json({ error: "Failed to delete account." }, { status: 500 });
  }
}
