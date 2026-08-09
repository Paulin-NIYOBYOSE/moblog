import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB per image, defense in depth (client already compresses)

// GET /api/media/images?folderId=... -> metadata only, no image bytes
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId") || null;
    const images = await prisma.mediaImage.findMany({
      where: { folderId },
      orderBy: { createdAt: "desc" },
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
    return NextResponse.json(images);
  } catch (error) {
    console.error("GET /api/media/images failed:", error);
    return NextResponse.json({ error: "Failed to load images." }, { status: 500 });
  }
}

// POST /api/media/images -> multipart/form-data upload: file, folderId, name?, caption?, width?, height?
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image is too large (max 8MB)." }, { status: 400 });
    }
    const folderIdRaw = form.get("folderId");
    const folderId = typeof folderIdRaw === "string" && folderIdRaw ? folderIdRaw : null;
    const name = (form.get("name") as string) || file.name || "image";
    const caption = (form.get("caption") as string) || null;
    const width = form.get("width") ? Number(form.get("width")) : null;
    const height = form.get("height") ? Number(form.get("height")) : null;

    const buffer = Buffer.from(await file.arrayBuffer());

    const image = await prisma.mediaImage.create({
      data: {
        folderId,
        name,
        mimeType: file.type || "image/jpeg",
        size: buffer.byteLength,
        data: buffer,
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null,
        caption,
      },
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

    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    console.error("POST /api/media/images failed:", error);
    return NextResponse.json({ error: "Failed to upload image." }, { status: 500 });
  }
}
