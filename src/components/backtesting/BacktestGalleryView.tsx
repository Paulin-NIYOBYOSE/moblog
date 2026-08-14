"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImageOff, Layers, Loader2, Upload } from "lucide-react";
import { INSTRUMENTS, OVERALL_TARGET, galleryTargetLabel } from "@/lib/backtesting";
import { useMediaData } from "@/lib/useMediaData";
import { useBacktestingData } from "@/lib/useBacktestingData";
import { useToast } from "@/components/ToastContext";
import { cn } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import Badge from "@/components/ui/Badge";
import ImageLightbox from "@/components/gallery/ImageLightbox";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Read-only lookup — viewing a target never creates a folder. Returns null
// until the first screenshot is uploaded there.
async function lookupFolder(target: string): Promise<string | null> {
  const res = await fetch(`/api/backtesting/gallery-folder?target=${encodeURIComponent(target)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load gallery folder");
  return (await res.json()).folderId as string | null;
}

// Creates the folder if needed. Only called from the upload path, so the write
// is user-initiated rather than happening on every page view.
async function ensureFolder(target: string): Promise<string> {
  const res = await fetch("/api/backtesting/gallery-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
  if (!res.ok) throw new Error("Failed to prepare gallery folder");
  return (await res.json()).folderId as string;
}

export default function BacktestGalleryView({
  target,
  onSelect,
}: {
  target: string;
  onSelect: (target: string) => void;
}) {
  const toast = useToast();
  // Toast identity changes on every toast add/remove (e.g. throughout an
  // upload's lifecycle) — keep a ref so it doesn't retrigger the folder
  // resolution effect below and reset `ready` mid-upload.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOverall = target === OVERALL_TARGET;
  const { items } = useBacktestingData();
  const pairItems = items.filter((i) => i.instrument === target);
  const pairDone = pairItems.filter((i) => i.completed).length;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    lookupFolder(target)
      .then((id) => {
        if (cancelled) return;
        setFolderId(id);
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) toastRef.current.error(e instanceof Error ? e.message : "Failed to load gallery folder");
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  // Only fetch once a folder actually exists — a null folderId here means
  // "no screenshots yet", not "the gallery root".
  const { images, loading, uploading, uploadImages, deleteImage, renameImage, updateCaption } = useMediaData(
    folderId,
    { enabled: ready && folderId !== null },
  );

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    try {
      // The folder is created on first upload rather than on page view.
      const targetFolderId = folderId ?? (await ensureFolder(target));
      if (targetFolderId !== folderId) setFolderId(targetFolderId);
      await uploadImages(list, note.trim() || undefined, targetFolderId);
      setNote("");
    } catch (e) {
      toastRef.current.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {INSTRUMENTS.map((pair) => (
          <button
            key={pair}
            type="button"
            onClick={() => onSelect(pair)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
              pair === target
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {pair}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onSelect(OVERALL_TARGET)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
            isOverall
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <Layers className="h-3 w-3" />
          All pairs combined
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{galleryTargetLabel(target)}</h2>
            {!isOverall && pairItems.length > 0 && (
              <Badge
                tone={pairDone === pairItems.length ? "profit" : "muted"}
                icon={pairDone === pairItems.length ? Check : undefined}
              >
                {pairDone}/{pairItems.length} years backtested
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {isOverall
              ? "Combined analytics across all 28 pairs"
              : "Analytics across the full 2020–2025 run"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for this upload (optional)"
            className="input w-52 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !ready}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-transform hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload screenshots
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <Card padding="lg" className={cn("transition-colors", dragOver && "border-accent bg-accent/5")}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
          }}
        >
          {!ready || loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-video" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ImageOff className="mb-3 h-8 w-8 text-muted" />
              <p className="text-sm font-medium">No screenshots yet for {galleryTargetLabel(target)}</p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                {isOverall
                  ? "Upload your combined all-pairs analytics here once every pair is done."
                  : "Drop this pair's analytics screenshot here, or use the upload button above."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="group overflow-hidden rounded-xl border border-border bg-surface-2 text-left transition-colors hover:border-accent/40"
                >
                  <div className="relative aspect-video overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/media/images/${img.id}`}
                      alt={img.name}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  </div>
                  {/* Notes matter more than filenames here, so show them inline
                      rather than only on hover. */}
                  <div className="px-2.5 py-2">
                    <p className="truncate text-xs font-medium">{img.caption || img.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {img.caption ? img.name : formatBytes(img.size)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDelete={deleteImage}
          onRename={renameImage}
          onUpdateCaption={updateCaption}
          captionPlaceholder="Add a note..."
        />
      )}
    </div>
  );
}
