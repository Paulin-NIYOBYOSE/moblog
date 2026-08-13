import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/backtesting/items/:id -> { completed: boolean }
export async function PATCH(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    if (typeof body.completed !== "boolean") {
      return NextResponse.json({ error: "completed (boolean) is required." }, { status: 400 });
    }
    const item = await prisma.backtestItem.update({
      where: { id },
      data: {
        completed: body.completed,
        completedAt: body.completed ? new Date() : null,
      },
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error("PATCH /api/backtesting/items/:id failed:", error);
    return NextResponse.json({ error: "Failed to update item." }, { status: 500 });
  }
}
