"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { MediaImage } from "@/lib/media/types";
import { useConfirm } from "@/components/ConfirmContext";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageLightbox({
  images,
  index,
  onClose,
  onNavigate,
  onDelete,
  onRename,
}: {
  images: MediaImage[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const image = images[index];
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(image?.name ?? "");
  const [deleting, setDeleting] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    setNameDraft(image?.name ?? "");
    setEditingName(false);
  }, [image]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < images.length - 1) onNavigate(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onNavigate]);

  if (!image) return null;

  async function handleDelete() {
    const confirmed = await confirm({
      title: "Delete image",
      message: `Delete "${image.name}"? This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await onDelete(image.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  async function commitName() {
    setEditingName(false);
    if (nameDraft.trim() && nameDraft.trim() !== image.name) {
      await onRename(image.id, nameDraft.trim());
    } else {
      setNameDraft(image.name);
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => e.key === "Enter" && commitName()}
                className="w-full max-w-md rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="truncate text-left text-sm font-medium text-white hover:underline"
                title="Click to rename"
              >
                {image.name}
              </button>
            )}
            <p className="text-xs text-white/50">
              {formatBytes(image.size)}
              {image.width && image.height ? ` · ${image.width}×${image.height}` : ""} · {index + 1}/{images.length}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={`/api/media/images/${image.id}?download=1`}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-loss disabled:opacity-50"
              title="Delete"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
          {index > 0 && (
            <button
              type="button"
              onClick={() => onNavigate(index - 1)}
              className="absolute left-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <motion.img
            key={image.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            src={`/api/media/images/${image.id}`}
            alt={image.name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
          {index < images.length - 1 && (
            <button
              type="button"
              onClick={() => onNavigate(index + 1)}
              className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </AnimatePresence>
  );
}
