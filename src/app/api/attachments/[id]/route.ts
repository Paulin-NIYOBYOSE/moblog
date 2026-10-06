import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import { ATTACHMENT_SELECT, unauthorized } from "@/lib/server/parse";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET /api/attachments/:id -> raw image bytes (used as <img src>)
export async function GET(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) return unauthorized();
  const { id } = await params;
  const file = await prisma.attachment.findUnique({
    where: { id },
    select: { data: true, mimeType: true, name: true },
  });
  if (!file) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download");
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      ...(download ? { "Content-Disposition": `attachment; filename="${file.name.replace(/"/g, "")}"` } : {}),
    },
  });
}

// PUT /api/attachments/:id -> { name?, caption? }
export async function PUT(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) return unauthorized();
  try {
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim().slice(0, 200) || "image";
    if (body.caption !== undefined) data.caption = body.caption ? String(body.caption).trim().slice(0, 500) : null;
    const attachment = await prisma.attachment.update({ where: { id }, data, select: ATTACHMENT_SELECT });
    return NextResponse.json(attachment);
  } catch (error) {
    console.error("PUT /api/attachments/:id failed:", error);
    return NextResponse.json({ error: "Failed to update image." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) return unauthorized();
  try {
    const { id } = await params;
    await prisma.attachment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/attachments/:id failed:", error);
    return NextResponse.json({ error: "Failed to delete image." }, { status: 500 });
  }
}
