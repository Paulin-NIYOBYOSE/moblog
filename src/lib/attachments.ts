"use client";

// Client helpers for images attached to journal entries and Backtesting v2
// trades/sessions. Images are compressed in the browser first (same pipeline
// as the gallery) because they're stored in Postgres.

import { compressImage } from "./media/compress";
import type { Attachment, AttachmentOwner } from "./types";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function attachmentSrc(id: string): string {
  return `/api/attachments/${id}`;
}

export async function uploadAttachment(file: File, owner: AttachmentOwner, caption?: string): Promise<Attachment> {
  const { blob, width, height } = await compressImage(file);
  const form = new FormData();
  form.append("file", blob, file.name || "image.jpg");
  for (const [k, v] of Object.entries(owner)) form.append(k, v);
  form.append("name", file.name || "image");
  form.append("width", String(width));
  form.append("height", String(height));
  if (caption) form.append("caption", caption);
  const res = await fetch("/api/attachments", { method: "POST", body: form });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/** Uploads sequentially; returns what succeeded plus per-file errors. */
export async function uploadAttachments(
  files: File[],
  owner: AttachmentOwner,
): Promise<{ uploaded: Attachment[]; errors: string[] }> {
  const uploaded: Attachment[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      uploaded.push(await uploadAttachment(f, owner));
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`);
    }
  }
  return { uploaded, errors };
}

export async function deleteAttachment(id: string): Promise<void> {
  const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function updateAttachment(id: string, patch: { name?: string; caption?: string }): Promise<Attachment> {
  const res = await fetch(`/api/attachments/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/** Image files from a paste or drop event. */
export function imageFilesFrom(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => f.type.startsWith("image/"));
}
