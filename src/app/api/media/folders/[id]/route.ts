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
    if (body.parentId !== undefined) data.parentId = body.parentId ? String(body.parentId) : null;
    const folder = await prisma.mediaFolder.update({ where: { id }, data });
    return NextResponse.json(folder);
  } catch (error) {
    console.error("PUT /api/media/folders/:id failed:", error);
    return NextResponse.json({ error: "Failed to update folder." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await prisma.mediaFolder.delete({ where: { id } }); // cascades to subfolders + images
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/media/folders/:id failed:", error);
    return NextResponse.json({ error: "Failed to delete folder." }, { status: 500 });
  }
}
