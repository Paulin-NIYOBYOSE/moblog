"use client";

import { useRef, useState } from "react";
import { ChevronRight, FolderPlus, Home, ImageOff, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { useMediaData } from "@/lib/useMediaData";
import { useConfirm } from "@/components/ConfirmContext";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import NewFolderModal from "./NewFolderModal";
import ImageLightbox from "./ImageLightbox";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function GalleryBrowser({
  folderId,
  onNavigate,
}: {
  folderId: string | null;
  onNavigate: (folderId: string | null) => void;
}) {
  const {
    folders,
    images,
    breadcrumb,
    loading,
    error,
    uploading,
    createFolder,
    deleteFolder,
    renameFolder,
    uploadImages,
    deleteImage,
    renameImage,
  } = useMediaData(folderId);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  async function handleDeleteFolder(id: string, name: string) {
    const confirmed = await confirm({
      title: "Delete folder",
      message: `Delete "${name}" and everything inside it? This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      destructive: true,
    });
    if (confirmed) await deleteFolder(id);
  }

  function commitRename(id: string) {
    const name = renameDraft.trim();
    setRenamingFolderId(null);
    if (name) renameFolder(id, name);
  }

  function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length) uploadImages(list);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => onNavigate(null)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-surface-2",
              !folderId ? "font-semibold text-foreground" : "text-muted",
            )}
          >
            <Home className="h-3.5 w-3.5" /> Gallery
          </button>
          {breadcrumb.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted" />
              <button
                type="button"
                onClick={() => onNavigate(c.id)}
                className={cn(
                  "rounded-md px-2 py-1 transition-colors hover:bg-surface-2",
                  i === breadcrumb.length - 1 ? "font-semibold text-foreground" : "text-muted",
                )}
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNewFolderOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2"
          >
            <FolderPlus className="h-3.5 w-3.5" /> New folder
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-transform hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload images
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

      {error && (
        <div className="mb-4 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">{error}</div>
      )}

      <Card
        padding="lg"
        className={cn("transition-colors", dragOver && "border-accent bg-accent/5")}
      >
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
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : folders.length === 0 && images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ImageOff className="mb-3 h-8 w-8 text-muted" />
              <p className="text-sm font-medium">This folder is empty</p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                {folderId
                  ? "Drop images in here, or nest another folder for finer organization."
                  : 'Organize however suits you — e.g. one folder per pair ("EURUSD", "GBPUSD"), with year subfolders inside each, plus "All Pairs" or "Total" folders for combined views.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {folders.map((f) => (
                <div key={f.id} className="group relative">
                  {renamingFolderId === f.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => commitRename(f.id)}
                      onKeyDown={(e) => e.key === "Enter" && commitRename(f.id)}
                      className="input py-1.5 text-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate(f.id)}
                      className="flex w-full flex-col items-center gap-2 rounded-xl border border-border bg-surface-2 p-3 text-center transition-colors hover:border-accent/40 hover:bg-surface-2/80"
                    >
                      <svg viewBox="0 0 24 24" className="h-9 w-9 text-accent" fill="currentColor">
                        <path d="M3 6a2 2 0 0 1 2-2h4.5l2 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
                      </svg>
                      <span className="w-full truncate text-xs font-medium">{f.name}</span>
                      <span className="text-[10px] text-muted">
                        {(f.folderCount ?? 0) + (f.imageCount ?? 0)} item
                        {(f.folderCount ?? 0) + (f.imageCount ?? 0) === 1 ? "" : "s"}
                      </span>
                    </button>
                  )}
                  <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingFolderId(f.id);
                        setRenameDraft(f.name);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-surface text-muted shadow-sm hover:text-foreground"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFolder(f.id, f.name)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-surface text-muted shadow-sm hover:text-loss"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}

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
                    <p className="text-[10px] text-white/70">{formatBytes(img.size)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <NewFolderModal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} onCreate={createFolder} />

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDelete={deleteImage}
          onRename={renameImage}
        />
      )}
    </div>
  );
}
