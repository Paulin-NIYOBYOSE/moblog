"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  SlidersHorizontal,
  ExternalLink,
  Image as ImageIcon,
  Pencil,
  Trash2,
  LayoutGrid,
  List,
  Tag,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useData } from "@/lib/useData";
import { useConfirm } from "@/components/ConfirmContext";
import { useToast } from "@/components/ToastContext";
import CustomSelect from "@/components/CustomSelect";
import ContentModal from "@/components/ContentModal";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import type { Content, ContentInput, ContentStatus, ContentType, Platform } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ContentStatus, "info" | "warning" | "accent" | "profit" | "muted"> = {
  IDEA: "info",
  DRAFT: "warning",
  READY: "accent",
  PUBLISHED: "profit",
  ARCHIVED: "muted",
};

const STATUS_OPTIONS: { value: ContentStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "IDEA", label: "Idea" },
  { value: "DRAFT", label: "Draft" },
  { value: "READY", label: "Ready" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const PLATFORM_OPTIONS: { value: Platform | "all"; label: string }[] = [
  { value: "all", label: "All platforms" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "X", label: "X" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "TWITCH", label: "Twitch" },
];

const TYPE_OPTIONS: { value: ContentType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "SHORT", label: "Short" },
  { value: "LIVE_STREAM", label: "Live Stream" },
  { value: "PHOTOS", label: "Photos" },
  { value: "TEXT_STORY", label: "Story" },
  { value: "REEL", label: "Reel" },
  { value: "POST", label: "Post" },
  { value: "THREAD", label: "Thread" },
  { value: "VIDEO", label: "Video" },
];

const TYPE_LABELS: Record<ContentType, string> = {
  SHORT: "Short",
  LIVE_STREAM: "Live Stream",
  PHOTOS: "Photos",
  TEXT_STORY: "Story",
  REEL: "Reel",
  POST: "Post",
  THREAD: "Thread",
  VIDEO: "Video",
};

// Fixed order → one categorical hue each, identity data (never cycled).
const PLATFORM_COLOR: Record<Platform, string> = {
  INSTAGRAM: "var(--chart-1)",
  TIKTOK: "var(--chart-2)",
  YOUTUBE: "var(--chart-3)",
  X: "var(--chart-4)",
  LINKEDIN: "var(--chart-5)",
  TWITCH: "var(--chart-6)",
};

function PlatformChip({ platform }: { platform: Platform }) {
  const color = PLATFORM_COLOR[platform];
  return (
    <span
      className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium"
      style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, color }}
    >
      {platform}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PAGE_SIZE = 10;

export default function ContentDashboardPage() {
  const { content, loading, error, createContent, updateContent, deleteContent } = useData();
  const confirm = useConfirm();
  const toast = useToast();

  const [view, setView] = useState<"table" | "kanban" | "topics">("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "all">("all");
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ContentType | "all">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<Content | null>(null);

  const filteredContent = useMemo(() => {
    return content.filter((item) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.topics.some((t) => t.toLowerCase().includes(q));
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesPlatform = platformFilter === "all" || item.platforms.includes(platformFilter);
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      return matchesSearch && matchesStatus && matchesPlatform && matchesType;
    });
  }, [content, search, statusFilter, platformFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredContent.length / PAGE_SIZE));
  const pagedContent = filteredContent.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function resetPage() {
    setPage(1);
  }

  function openAdd() {
    setEditingContent(null);
    setModalOpen(true);
  }
  function openEdit(item: Content) {
    setEditingContent(item);
    setModalOpen(true);
  }

  async function handleModalSubmit(input: ContentInput) {
    if (editingContent) {
      await updateContent(editingContent.id, input);
    } else {
      await createContent(input);
    }
  }

  async function handleDelete(item: Content) {
    const confirmed = await confirm({
      title: "Delete content",
      message: `Delete "${item.title}"? This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteContent(item.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete content");
    }
  }

  async function handleStatusChange(item: Content, newStatus: ContentStatus) {
    try {
      await updateContent(item.id, {
        title: item.title,
        status: newStatus,
        platforms: item.platforms,
        type: item.type,
        topics: item.topics,
        publishDate: item.publishDate,
        url: item.url,
        visuals: item.visuals,
        nextStatus: item.nextStatus,
        notes: item.notes,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  return (
    <div>
      <PageHeader
        title="Content"
        subtitle="Plan, track, and publish your content"
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground shadow-sm transition-transform active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> New content
          </button>
        }
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">
          <span>{error}</span>
        </div>
      )}

      <FilterBar
        expanded={showFilters}
        expandedContent={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <CustomSelect
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v as ContentStatus | "all");
                resetPage();
              }}
              options={STATUS_OPTIONS}
            />
            <CustomSelect
              value={platformFilter}
              onChange={(v) => {
                setPlatformFilter(v as Platform | "all");
                resetPage();
              }}
              options={PLATFORM_OPTIONS}
            />
            <CustomSelect
              value={typeFilter}
              onChange={(v) => {
                setTypeFilter(v as ContentType | "all");
                resetPage();
              }}
              options={TYPE_OPTIONS}
            />
          </div>
        }
      >
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search title, topic..."
            className="input pl-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                resetPage();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <SegmentedControl
          options={[
            { value: "table", label: "Table", icon: List },
            { value: "kanban", label: "Board", icon: LayoutGrid },
            { value: "topics", label: "Topics", icon: Tag },
          ]}
          value={view}
          onChange={setView}
        />

        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={cn(
            "ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors",
            showFilters
              ? "bg-surface-2 text-foreground"
              : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
      </FilterBar>

      {loading ? (
        <div className="space-y-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-[400px]" />
        </div>
      ) : filteredContent.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={Tag}
            title={content.length === 0 ? "No content yet." : "No content matches your filters."}
            description={
              content.length === 0 ? "Create your first piece of content to start planning." : undefined
            }
            action={
              content.length === 0 ? (
                <button
                  type="button"
                  onClick={openAdd}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
                >
                  <Plus className="h-4 w-4" /> New content
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {view === "table" && (
            <>
              <Card padding="none" className="overflow-hidden">
                {/* Card list — mobile/tablet-portrait */}
                <div className="space-y-2 p-4 md:hidden">
                  {pagedContent.map((item, i) => (
                    <motion.button
                      key={item.id}
                      type="button"
                      onClick={() => openEdit(item)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.02 }}
                      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-left transition-colors hover:border-accent/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{item.title}</span>
                        <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.platforms.map((p) => (
                          <PlatformChip key={p} platform={p} />
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
                        <span>{TYPE_LABELS[item.type]}</span>
                        <span>· {formatDate(item.publishDate)}</span>
                        {item.topics.length > 0 && <span>· {item.topics.join(", ")}</span>}
                      </div>
                    </motion.button>
                  ))}
                </div>

                {/* Table — md and up */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-y border-border text-left text-xs uppercase tracking-wide text-muted">
                        <th className="px-4 py-2.5 font-medium">Title</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-4 py-2.5 font-medium">Platforms</th>
                        <th className="px-4 py-2.5 font-medium">Type</th>
                        <th className="px-4 py-2.5 font-medium">Topics</th>
                        <th className="px-4 py-2.5 font-medium">Publish date</th>
                        <th className="px-4 py-2.5 text-center font-medium">Links</th>
                        <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedContent.map((item) => (
                        <tr
                          key={item.id}
                          className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                          onClick={() => openEdit(item)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium">{item.title}</div>
                            {item.nextStatus && (
                              <div className="mt-0.5 text-xs text-muted">{item.nextStatus}</div>
                            )}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={item.status}
                              onChange={(e) => handleStatusChange(item, e.target.value as ContentStatus)}
                              className="cursor-pointer rounded-md border border-border bg-transparent px-2 py-1 text-xs font-medium outline-none"
                            >
                              {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {item.platforms.map((p) => (
                                <PlatformChip key={p} platform={p} />
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted">{TYPE_LABELS[item.type]}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {item.topics.map((topic) => (
                                <span
                                  key={topic}
                                  className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium"
                                >
                                  {topic}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted">
                            {formatDate(item.publishDate)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              {item.visuals ? (
                                <a
                                  href={item.visuals}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-muted hover:text-accent"
                                  title="Visuals"
                                >
                                  <ImageIcon className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                              {item.url ? (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-muted hover:text-accent"
                                  title="URL"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                              {!item.visuals && !item.url && <span className="text-muted">—</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => openEdit(item)}
                                className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item)}
                                className="rounded-md p-1.5 text-muted transition-colors hover:bg-loss-soft hover:text-loss"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {filteredContent.length > PAGE_SIZE && (
                <Card padding="sm" className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted">
                    Showing {pagedContent.length} of {filteredContent.length} items
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-lg border border-border px-3 py-1.5 font-medium transition-colors disabled:opacity-40 hover:bg-surface-2"
                    >
                      Previous
                    </button>
                    <span className="tabular-nums">
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-border px-3 py-1.5 font-medium transition-colors disabled:opacity-40 hover:bg-surface-2"
                    >
                      Next
                    </button>
                  </div>
                </Card>
              )}
            </>
          )}

          {view === "kanban" && (
            <div className="grid grid-cols-1 items-start gap-4 overflow-x-auto pb-2 sm:grid-cols-2 lg:grid-cols-5">
              {(STATUS_OPTIONS.filter((o) => o.value !== "all") as { value: ContentStatus; label: string }[]).map(
                ({ value: status, label }) => {
                  const items = filteredContent.filter((c) => c.status === status);
                  return (
                    <Card key={status} padding="md">
                      <div className="mb-3 flex items-center gap-2">
                        <Badge tone={STATUS_TONE[status]}>{label}</Badge>
                        <span className="text-xs text-muted">{items.length}</span>
                      </div>
                      <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-0.5">
                        {items.map((item, i) => (
                          <motion.button
                            key={item.id}
                            type="button"
                            onClick={() => openEdit(item)}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.03 }}
                            className="w-full rounded-lg border border-border bg-surface-2 p-3 text-left transition-colors hover:border-accent/40"
                          >
                            <div className="mb-2 text-sm font-medium">{item.title}</div>
                            <div className="flex flex-wrap gap-1">
                              {item.platforms.slice(0, 3).map((p) => (
                                <PlatformChip key={p} platform={p} />
                              ))}
                              {item.platforms.length > 3 && (
                                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">
                                  +{item.platforms.length - 3}
                                </span>
                              )}
                            </div>
                          </motion.button>
                        ))}
                        {items.length === 0 && (
                          <p className="py-4 text-center text-xs text-muted">Nothing here</p>
                        )}
                      </div>
                    </Card>
                  );
                },
              )}
            </div>
          )}

          {view === "topics" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from(new Set(filteredContent.flatMap((c) => c.topics))).map((topic) => {
                const items = filteredContent.filter((c) => c.topics.includes(topic));
                return (
                  <Card key={topic} padding="md">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{topic}</h3>
                      <span className="text-xs text-muted">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openEdit(item)}
                          className="w-full rounded-lg border border-border bg-surface-2 p-3 text-left transition-colors hover:border-accent/40"
                        >
                          <div className="mb-2 text-sm font-medium">{item.title}</div>
                          <div className="flex items-center gap-2">
                            <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
                            <span className="text-[10px] text-muted">{TYPE_LABELS[item.type]}</span>
                          </div>
                        </button>
                      ))}
                      {items.length > 5 && (
                        <div className="text-center text-xs text-muted">+{items.length - 5} more</div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <ContentModal
        open={modalOpen}
        content={editingContent}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
        onDelete={deleteContent}
      />
    </div>
  );
}
