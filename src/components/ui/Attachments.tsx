"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { attachmentSrc, imageFilesFrom } from "@/lib/attachments";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import ImageLightbox from "@/components/gallery/ImageLightbox";

/**
 * Image picker for editors: drop, browse or paste (⌘V) screenshots. New files
 * stay local (with previews) until the parent saves; already-uploaded images
 * open in the lightbox where they can be renamed, captioned or deleted.
 */
export function AttachmentField({
  existing = [],
  pending,
  onPendingChange,
  onDeleteExisting,
  onEditExisting,
  listenPaste = true,
  hint = "Drop chart screenshots, browse, or paste with ⌘V / Ctrl+V",
}: {
  existing?: Attachment[];
  pending: File[];
  onPendingChange: (files: File[]) => void;
  onDeleteExisting?: (id: string) => Promise<void>;
  onEditExisting?: (id: string, patch: { name?: string; caption?: string }) => Promise<void>;
  listenPaste?: boolean;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const previews = useMemo(() => pending.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [pending]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  useEffect(() => {
    if (!listenPaste) return;
    function onPaste(e: ClipboardEvent) {
      const files = imageFilesFrom(e.clipboardData?.files);
      if (!files.length) return;
      e.preventDefault();
      const named = files.map((f, i) =>
        f.name && f.name !== "image.png" ? f : new File([f], `pasted-${Date.now()}-${i + 1}.png`, { type: f.type }),
      );
      onPendingChange([...pendingRef.current, ...named]);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [listenPaste, onPendingChange]);

  function add(list: FileList | File[] | null) {
    const files = imageFilesFrom(list);
    if (files.length) onPendingChange([...pending, ...files]);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-4 py-6 text-center transition-colors",
          dragOver ? "border-accent bg-accent-soft" : "border-border-strong bg-surface-2/60 hover:border-accent/50 hover:bg-accent-soft/40",
        )}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-accent shadow-card">
          <ImagePlus className="h-4.5 w-4.5" />
        </span>
        <span className="text-sm font-medium">Add images</span>
        <span className="text-xs text-muted">{hint}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {(existing.length > 0 || previews.length > 0) && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {existing.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setLightbox(i)}
              className="group relative aspect-video overflow-hidden rounded-xl border border-border bg-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachmentSrc(a.id)} alt={a.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              {a.caption && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-left text-[10px] text-white">
                  {a.caption}
                </span>
              )}
            </button>
          ))}
          {previews.map((p, i) => (
            <div key={p.url} className="relative aspect-video overflow-hidden rounded-xl border border-accent/40 bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.file.name} className="h-full w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-accent px-1 py-px text-[9px] font-semibold uppercase text-white">New</span>
              <button
                type="button"
                onClick={() => onPendingChange(pending.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {lightbox !== null && existing[lightbox] && (
        <ImageLightbox
          images={existing}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
          srcFor={attachmentSrc}
          onDelete={async (id) => {
            await onDeleteExisting?.(id);
          }}
          onRename={async (id, name) => {
            await onEditExisting?.(id, { name });
          }}
          onUpdateCaption={onEditExisting ? async (id, caption) => onEditExisting(id, { caption }) : undefined}
        />
      )}
    </div>
  );
}

/** Read-only thumbnail strip that opens the lightbox. */
export function AttachmentStrip({
  attachments,
  onDelete,
  onEdit,
  size = "md",
  max,
}: {
  attachments: Attachment[];
  onDelete?: (id: string) => Promise<void>;
  onEdit?: (id: string, patch: { name?: string; caption?: string }) => Promise<void>;
  size?: "sm" | "md" | "lg";
  max?: number;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  if (!attachments.length) return null;
  const shown = max ? attachments.slice(0, max) : attachments;
  const more = attachments.length - shown.length;
  return (
    <>
      <div
        className={cn(
          "grid gap-2",
          size === "sm" ? "grid-cols-4 sm:grid-cols-6" : size === "lg" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3",
        )}
      >
        {shown.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(i);
            }}
            className="group relative aspect-video overflow-hidden rounded-xl border border-border bg-surface-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachmentSrc(a.id)} alt={a.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            {i === shown.length - 1 && more > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">+{more}</span>
            )}
            {a.caption && size !== "sm" && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-left text-[11px] text-white">
                {a.caption}
              </span>
            )}
          </button>
        ))}
      </div>
      {lightbox !== null && attachments[lightbox] && (
        <ImageLightbox
          images={attachments}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
          srcFor={attachmentSrc}
          onDelete={async (id) => {
            if (onDelete) await onDelete(id);
          }}
          onRename={async (id, name) => {
            if (onEdit) await onEdit(id, { name });
          }}
          onUpdateCaption={onEdit ? async (id, caption) => onEdit(id, { caption }) : undefined}
        />
      )}
    </>
  );
}
