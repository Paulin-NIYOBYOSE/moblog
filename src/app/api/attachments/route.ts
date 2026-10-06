import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import { ATTACHMENT_SELECT, badRequest, unauthorized } from "@/lib/server/parse";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // client compresses first; this is defense in depth

// POST /api/attachments -> multipart: file + exactly one owner
// (journalEntryId | btItemId), optional name/caption/width/height
export async function POST(request: Request) {
  if (!(await isAuthenticated())) return unauthorized();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("No file provided.");
    if (!file.type.startsWith("image/")) return badRequest("Only images can be attached.");
    if (file.size > MAX_BYTES) return badRequest("Image is too large (max 8MB).");

    const owner = {
      journalEntryId: (form.get("journalEntryId") as string) || null,
      btItemId: (form.get("btItemId") as string) || null,
    };
    const owners = Object.entries(owner).filter(([, v]) => v);
    if (owners.length !== 1) return badRequest("Attach to exactly one journal entry or session.");

    const [ownerKey, ownerId] = owners[0] as [keyof typeof owner, string];
    const exists =
      ownerKey === "journalEntryId"
        ? await prisma.journalEntry.findUnique({ where: { id: ownerId }, select: { id: true } })
        : await prisma.backtestV2Item.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Owner not found." }, { status: 404 });

    const width = form.get("width") ? Number(form.get("width")) : null;
    const height = form.get("height") ? Number(form.get("height")) : null;
    const buffer = Buffer.from(await file.arrayBuffer());

    const attachment = await prisma.attachment.create({
      data: {
        ...owner,
        name: ((form.get("name") as string) || file.name || "image").slice(0, 200),
        caption: ((form.get("caption") as string) || "").trim().slice(0, 500) || null,
        mimeType: file.type || "image/jpeg",
        size: buffer.byteLength,
        data: buffer,
        width: Number.isFinite(width) ? width : null,
        height: Number.isFinite(height) ? height : null,
      },
      select: ATTACHMENT_SELECT,
    });
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("POST /api/attachments failed:", error);
    return NextResponse.json({ error: "Failed to upload image." }, { status: 500 });
  }
}
