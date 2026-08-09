import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

async function breadcrumbFor(folderId: string | null): Promise<{ id: string; name: string }[]> {
  const crumbs: { id: string; name: string }[] = [];
  let currentId = folderId;
  while (currentId) {
    const folder: { id: string; name: string; parentId: string | null } | null = await prisma.mediaFolder.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true },
    });
    if (!folder) break;
    crumbs.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }
  return crumbs;
}

// GET /api/media/folders?parentId=... -> child folders (+ counts) and breadcrumb path
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId") || null;

    const folders = await prisma.mediaFolder.findMany({
      where: { parentId },
      orderBy: { name: "asc" },
      include: { _count: { select: { children: true, images: true } } },
    });

    const breadcrumb = await breadcrumbFor(parentId);

    return NextResponse.json({
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        folderCount: f._count.children,
        imageCount: f._count.images,
      })),
      breadcrumb,
    });
  } catch (error) {
    console.error("GET /api/media/folders failed:", error);
    return NextResponse.json({ error: "Failed to load folders." }, { status: 500 });
  }
}

// POST /api/media/folders -> create a folder
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Folder name is required." }, { status: 400 });
    }
    const parentId = body.parentId ? String(body.parentId) : null;
    const folder = await prisma.mediaFolder.create({ data: { name, parentId } });
    return NextResponse.json({ ...folder, folderCount: 0, imageCount: 0 }, { status: 201 });
  } catch (error) {
    console.error("POST /api/media/folders failed:", error);
    return NextResponse.json({ error: "Failed to create folder." }, { status: 500 });
  }
}
