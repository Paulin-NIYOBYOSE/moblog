import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET /api/media/images/:id -> raw image bytes (used as <img src>)
export async function GET(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const image = await prisma.mediaImage.findUnique({
    where: { id },
    select: { data: true, mimeType: true, name: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download");

  const body = new Uint8Array(image.data);
  return new NextResponse(body, {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      ...(download ? { "Content-Disposition": `attachment; filename="${image.name}"` } : {}),
    },
  });
}

export async function PUT(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.caption !== undefined) data.caption = body.caption ? String(body.caption).trim() : null;
    if (body.folderId !== undefined) data.folderId = body.folderId ? String(body.folderId) : null;

    const image = await prisma.mediaImage.update({
      where: { id },
      data,
      select: {
        id: true,
        folderId: true,
        name: true,
        mimeType: true,
        size: true,
        width: true,
        height: true,
        caption: true,
        createdAt: true,
      },
    });
    return NextResponse.json(image);
  } catch (error) {
    console.error("PUT /api/media/images/:id failed:", error);
    return NextResponse.json({ error: "Failed to update image." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await prisma.mediaImage.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/media/images/:id failed:", error);
    return NextResponse.json({ error: "Failed to delete image." }, { status: 500 });
  }
}
