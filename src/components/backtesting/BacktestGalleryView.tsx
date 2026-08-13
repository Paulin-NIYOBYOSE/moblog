"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImageOff, Loader2, Upload } from "lucide-react";
import { INSTRUMENTS, YEARS } from "@/lib/backtesting";
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

export default function BacktestGalleryView({
  instrument,
  year,
  onSelect,
}: {
  instrument: string;
  year: number;
  onSelect: (instrument: string, year: number) => void;
}) {
  const toast = useToast();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { items } = useBacktestingData();
  const currentItem = items.find((i) => i.instrument === instrument && i.year === year);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const res = await fetch("/api/backtesting/gallery-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instrument, year }),
        });
        if (!res.ok) throw new Error("Failed to load gallery folder");
        const data = await res.json();
        if (!cancelled) {
          setFolderId(data.folderId);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load gallery folder");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instrument, year, toast]);

  const { images, loading, uploading, uploadImages, deleteImage, renameImage, updateCaption } = useMediaData(
    folderId,
    { enabled: ready },
  );

  function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length) uploadImages(list, note.trim() || undefined);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {INSTRUMENTS.map((inst) => (
          <button
            key={inst}
            type="button"
            onClick={() => onSelect(inst, year)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
              inst === instrument
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {inst}
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {YEARS.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => onSelect(instrument, y)}
              className={cn(
                "rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
                y === year
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {y}
            </button>
          ))}
        </div>
        {currentItem && (
          <Badge tone={currentItem.completed ? "profit" : "muted"} icon={currentItem.completed ? Check : undefined}>
            {currentItem.completed ? "Backtested" : "Not backtested yet"}
          </Badge>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">
          {instrument} — {year}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note / tag (optional)"
            className="input w-44 py-1.5 text-xs"
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ImageOff className="mb-3 h-8 w-8 text-muted" />
              <p className="text-sm font-medium">No screenshots yet for {instrument} {year}</p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Drop screenshots here, or use the upload button above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/images/${img.id}`}
                    alt={img.name}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 opacity-0 transition-opacity group-hover:opacity-100">
                    <p className="truncate text-[11px] font-medium text-white">{img.name}</p>
                    <p className="truncate text-[10px] text-white/70">{img.caption || formatBytes(img.size)}</p>
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
          captionPlaceholder="Add a note or tag..."
        />
      )}
    </div>
  );
}
