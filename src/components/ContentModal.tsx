"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Content, ContentInput, ContentStatus, ContentType, Platform } from "@/lib/types";
import CustomSelect from "./CustomSelect";
import { useConfirm } from "./ConfirmContext";

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "IDEA", label: "Idea" },
  { value: "DRAFT", label: "Draft" },
  { value: "READY", label: "Ready" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "SHORT", label: "Short" },
  { value: "LIVE_STREAM", label: "Live Stream" },
  { value: "PHOTOS", label: "Photos" },
  { value: "TEXT_STORY", label: "Story" },
  { value: "REEL", label: "Reel" },
  { value: "POST", label: "Post" },
  { value: "THREAD", label: "Thread" },
  { value: "VIDEO", label: "Video" },
];

const PLATFORM_OPTIONS: Platform[] = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X", "LINKEDIN", "TWITCH"];

const EMPTY = {
  title: "",
  status: "IDEA" as ContentStatus,
  type: "SHORT" as ContentType,
  platforms: [] as Platform[],
  topics: "",
  publishDate: "",
  url: "",
  visuals: "",
  nextStatus: "",
  notes: "",
};

export default function ContentModal({
  open,
  content,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  content?: Content | null;
  onClose: () => void;
  onSubmit: (input: ContentInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(content);
  const confirm = useConfirm();

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (content) {
      setForm({
        title: content.title,
        status: content.status,
        type: content.type,
        platforms: content.platforms,
        topics: content.topics.join(", "),
        publishDate: content.publishDate ? content.publishDate.slice(0, 10) : "",
        url: content.url ?? "",
        visuals: content.visuals ?? "",
        nextStatus: content.nextStatus ?? "",
        notes: content.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, content]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function togglePlatform(platform: Platform) {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(platform)
        ? f.platforms.filter((p) => p !== platform)
        : [...f.platforms, platform],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const input: ContentInput = {
        title: form.title.trim(),
        status: form.status,
        type: form.type,
        platforms: form.platforms,
        topics: form.topics.split(",").map((t) => t.trim()).filter(Boolean),
        publishDate: form.publishDate || null,
        url: form.url.trim() || null,
        visuals: form.visuals.trim() || null,
        nextStatus: form.nextStatus.trim() || null,
        notes: form.notes.trim() || null,
      };
      await onSubmit(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!content || !onDelete) return;
    const confirmed = await confirm({
      title: "Delete content",
      message: `Delete "${content.title}"? This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await onDelete(content.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setDeleting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            className="relative z-10 flex h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">{isEdit ? "Edit content" : "New content"}</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-muted">Title</span>
                  <input
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    className="input"
                    placeholder="Content title..."
                    autoFocus
                    autoComplete="off"
                  />
                </label>

                <div>
                  <CustomSelect
                    label="Status"
                    value={form.status}
                    onChange={(v) => set("status", v as ContentStatus)}
                    options={STATUS_OPTIONS}
                  />
                </div>
                <div>
                  <CustomSelect
                    label="Type"
                    value={form.type}
                    onChange={(v) => set("type", v as ContentType)}
                    options={TYPE_OPTIONS}
                  />
                </div>

                <div className="sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-muted">Platforms</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PLATFORM_OPTIONS.map((platform) => {
                      const active = form.platforms.includes(platform);
                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => togglePlatform(platform)}
                          className={
                            "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors " +
                            (active
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-border text-muted hover:bg-surface-2 hover:text-foreground")
                          }
                        >
                          {platform}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    Topics (comma-separated)
                  </span>
                  <input
                    value={form.topics}
                    onChange={(e) => set("topics", e.target.value)}
                    className="input"
                    placeholder="Mindset, POV, Education..."
                    autoComplete="off"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">Publish date</span>
                  <input
                    type="date"
                    value={form.publishDate}
                    onChange={(e) => set("publishDate", e.target.value)}
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">Next status</span>
                  <input
                    value={form.nextStatus}
                    onChange={(e) => set("nextStatus", e.target.value)}
                    className="input"
                    placeholder="What's next?"
                    autoComplete="off"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">URL</span>
                  <input
                    type="url"
                    value={form.url}
                    onChange={(e) => set("url", e.target.value)}
                    className="input"
                    placeholder="https://..."
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">Visuals URL</span>
                  <input
                    type="url"
                    value={form.visuals}
                    onChange={(e) => set("visuals", e.target.value)}
                    className="input"
                    placeholder="https://..."
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-muted">Notes</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    className="input min-h-[80px] resize-none"
                    placeholder="Additional notes..."
                  />
                </label>
              </div>

              {error && (
                <p className="mt-3 rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p>
              )}

              <div className="mt-5 flex items-center gap-2">
                {isEdit && onDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting || saving}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-loss transition-colors hover:bg-loss-soft disabled:opacity-50"
                    aria-label="Delete content"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-auto rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-transform hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? "Save changes" : "Create"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
