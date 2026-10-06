"use client";

import { useEffect, useMemo, useState } from "react";
import { Angry, ArrowDownRight, ArrowUpRight, BookOpen, Check, ChevronDown, Frown, Laugh, Link2, Loader2, Meh, Smile, Trash2 } from "lucide-react";
import Modal, { Field } from "@/components/ui/Modal";
import { ChipGroup, RatingScale, TagInput, YesNo } from "@/components/ui/Inputs";
import { AttachmentField } from "@/components/ui/Attachments";
import CustomSelect from "@/components/CustomSelect";
import { useConfirm } from "@/components/ConfirmContext";
import { EMOTION_LABELS, MISTAKES, MOOD_LABELS, tradeDay, valenceOf, VALENCE_COLOR } from "@/lib/journal";
import { CHECKLIST, gradeFor, GRADE_STYLE, STRATEGY_NAME } from "@/lib/strategy";
import type { Account, JournalEntry, JournalEntryInput, Trade } from "@/lib/types";
import { cn, formatSignedCurrency, isClosed, todayKey } from "@/lib/utils";

export const MOOD_ICONS = [Angry, Frown, Meh, Smile, Laugh];

interface FormState {
  day: string;
  accountId: string;
  mood: number | null;
  followedPlan: boolean | null;
  checklist: string[];
  emotions: string[];
  mistakes: string[];
  notes: string;
  // "More" — optional
  title: string;
  lessons: string;
  tags: string[];
  tradeIds: string[];
}

function blank(day: string, accountId: string): FormState {
  return { day, accountId, mood: null, followedPlan: null, checklist: [], emotions: [], mistakes: [], notes: "", title: "", lessons: "", tags: [], tradeIds: [] };
}

function Label({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[0.8rem] font-semibold">{children}</span>
      {aside}
    </div>
  );
}

/**
 * One short screen: a few taps (mood, plan, checklist, feelings, mistakes),
 * one notes box and images. Everything else lives under "More".
 */
export default function JournalEntryModal({
  open,
  entry,
  defaultDay,
  defaultAccountId,
  accounts,
  trades,
  knownTags,
  onClose,
  onSave,
  onDelete,
  onRemoveImage,
  onEditImage,
}: {
  open: boolean;
  entry: JournalEntry | null;
  defaultDay?: string | null;
  defaultAccountId?: string | null;
  accounts: Account[];
  trades: Trade[];
  knownTags: string[];
  onClose: () => void;
  onSave: (input: JournalEntryInput, opts: { id?: string; files?: File[] }) => Promise<JournalEntry>;
  onDelete: (id: string) => Promise<void>;
  onRemoveImage: (entryId: string, attachmentId: string) => Promise<void>;
  onEditImage: (entryId: string, attachmentId: string, patch: { name?: string; caption?: string }) => Promise<void>;
}) {
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState>(() => blank(todayKey(), ""));
  const [files, setFiles] = useState<File[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFiles([]);
    if (entry) {
      setForm({
        day: entry.day,
        accountId: entry.accountId ?? "",
        mood: entry.mood,
        followedPlan: entry.followedPlan,
        checklist: entry.checklist,
        emotions: Array.from(new Set([...entry.emotionsBefore, ...entry.emotionsAfter])),
        mistakes: entry.mistakes,
        notes: entry.notes ?? "",
        title: entry.title ?? "",
        lessons: entry.lessons ?? "",
        tags: entry.tags,
        tradeIds: entry.tradeIds,
      });
      setShowMore(Boolean(entry.title || entry.lessons || entry.tags.length || entry.tradeIds.length));
    } else {
      setForm(blank(defaultDay ?? todayKey(), defaultAccountId ?? ""));
      setShowMore(false);
    }
  }, [open, entry, defaultDay, defaultAccountId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const dayTrades = useMemo(
    () =>
      trades
        .filter((t) => tradeDay(t) === form.day && (!form.accountId || t.accountId === form.accountId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [trades, form.day, form.accountId],
  );
  const counted = form.tradeIds.length ? dayTrades.filter((t) => form.tradeIds.includes(t.id)) : dayTrades;
  const countedClosed = counted.filter(isClosed);
  const countedPnl = countedClosed.reduce((s, t) => s + t.pnl, 0);
  const grade = gradeFor(form.checklist);

  async function handleSave() {
    setError(null);
    if (!form.day) {
      setError("Pick the day this entry is about.");
      return;
    }
    setSaving(true);
    try {
      const input: JournalEntryInput = {
        day: form.day,
        accountId: form.accountId || null,
        title: form.title.trim() || null,
        mood: form.mood,
        // Not asked any more — keep whatever an older entry already had.
        discipline: entry?.discipline ?? null,
        premarket: entry?.premarket ?? null,
        followedPlan: form.followedPlan,
        checklist: form.checklist,
        emotionsBefore: form.emotions,
        emotionsAfter: [],
        mistakes: form.mistakes,
        tags: form.tags,
        tradeIds: form.tradeIds.filter((id) => dayTrades.some((t) => t.id === id)),
        notes: form.notes.trim() || null,
        lessons: form.lessons.trim() || null,
      };
      await onSave(input, { id: entry?.id, files });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save entry.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    const ok = await confirm({ title: "Delete journal entry", message: "Delete this entry and its images? This cannot be undone.", confirmText: "Delete", destructive: true });
    if (!ok) return;
    setDeleting(true);
    try {
      await onDelete(entry.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={BookOpen}
      title={entry ? "Edit journal entry" : "New journal entry"}
      subtitle="A few taps and a note — that's it."
      footer={
        <>
          {entry && (
            <button type="button" onClick={handleDelete} disabled={deleting || saving} className="btn btn-danger btn-icon" aria-label="Delete entry">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
          {error && <p className="text-xs font-medium text-loss">{error}</p>}
          <span className="ml-auto hidden text-[11px] text-faint sm:inline">⌘ + Enter to save</span>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save entry
          </button>
        </>
      }
    >
      <div
        className="space-y-6"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSave();
          }
        }}
      >
        {/* Day + account */}
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day">
              <input type="date" value={form.day} onChange={(e) => set("day", e.target.value)} className="input" />
            </Field>
            <CustomSelect
              label="Account"
              value={form.accountId}
              onChange={(v) => {
                set("accountId", v);
                set("tradeIds", []);
              }}
              options={[{ value: "", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {dayTrades.length === 0 ? (
              "No trades closed this day — journal it anyway."
            ) : (
              <>
                {countedClosed.length} trade{countedClosed.length === 1 ? "" : "s"} closed this day ·{" "}
                <span className={cn("font-semibold", countedPnl > 0 ? "text-profit" : countedPnl < 0 ? "text-loss" : "")}>{formatSignedCurrency(countedPnl)}</span>
                <span className="text-faint"> — linked automatically</span>
              </>
            )}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
          <div>
            <Label>How do you feel about it?</Label>
            <RatingScale value={form.mood} onChange={(v) => set("mood", v)} labels={MOOD_LABELS} icons={MOOD_ICONS} />
          </div>
          <div>
            <Label>Followed your plan?</Label>
            <YesNo value={form.followedPlan} onChange={(v) => set("followedPlan", v)} />
          </div>
        </div>

        {/* Strategy checklist */}
        <div className="rounded-2xl border border-border bg-surface-2/60 p-4">
          <Label
            aside={
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => set("checklist", form.checklist.length === CHECKLIST.length ? [] : CHECKLIST.map((c) => c.key))}
                  className="text-[11px] font-medium text-muted hover:text-foreground"
                >
                  {form.checklist.length === CHECKLIST.length ? "Clear" : "All held"}
                </button>
                {grade ? (
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold", GRADE_STYLE[grade].chip)}>
                    {grade} · {form.checklist.length}/{CHECKLIST.length}
                  </span>
                ) : (
                  <span className="text-[11px] text-faint">No setup</span>
                )}
              </span>
            }
          >
            {STRATEGY_NAME} checklist <span className="font-normal text-muted">— tap what held</span>
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {CHECKLIST.map((c) => {
              const on = form.checklist.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  title={c.label}
                  data-active={on}
                  onClick={() => set("checklist", on ? form.checklist.filter((k) => k !== c.key) : [...form.checklist, c.key])}
                  className="chip"
                >
                  <span className="text-[9px] font-bold text-faint">{c.tf}</span>
                  {c.short}
                  {on && <Check className="h-3 w-3 text-accent" />}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Emotions</Label>
          <ChipGroup
            options={EMOTION_LABELS}
            value={form.emotions}
            onChange={(v) => set("emotions", v)}
            allowCustom
            renderDot={(o) => <span className="h-1.5 w-1.5 rounded-full" style={{ background: VALENCE_COLOR[valenceOf(o)] }} />}
          />
        </div>

        <div>
          <Label>Mistakes</Label>
          <ChipGroup options={MISTAKES} value={form.mistakes} onChange={(v) => set("mistakes", v)} allowCustom customPlaceholder="Other…" />
        </div>

        <div>
          <Label>Notes</Label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={4}
            placeholder="What happened, what you saw on the Weekly / Daily / 4H, what you'd repeat or change…"
            className="input resize-y"
          />
        </div>

        <div>
          <Label>Charts & images</Label>
          <AttachmentField
            existing={entry?.attachments ?? []}
            pending={files}
            onPendingChange={setFiles}
            listenPaste={open}
            onDeleteExisting={entry ? (id) => onRemoveImage(entry.id, id) : undefined}
            onEditExisting={entry ? (id, patch) => onEditImage(entry.id, id, patch) : undefined}
          />
        </div>

        <div className="border-t border-border pt-4">
          <button type="button" onClick={() => setShowMore((s) => !s)} className="flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")} />
            More (optional) — headline, lesson, tags, specific trades
          </button>
          {showMore && (
            <div className="mt-4 space-y-4 animate-fade-in">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Headline">
                  <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Patient GBPJPY retest" className="input" maxLength={200} />
                </Field>
                <Field label="Tags" hint={knownTags.length ? `Used before: ${knownTags.slice(0, 6).join(", ")}` : undefined}>
                  <TagInput value={form.tags} onChange={(v) => set("tags", v)} />
                </Field>
              </div>
              <Field label="Lesson for next time">
                <textarea value={form.lessons} onChange={(e) => set("lessons", e.target.value)} rows={2} placeholder="One thing to repeat or avoid." className="input resize-y" />
              </Field>
              {dayTrades.length > 0 && (
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">Only count specific trades (otherwise every trade that day counts)</span>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {dayTrades.map((t) => {
                      const linked = form.tradeIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => set("tradeIds", linked ? form.tradeIds.filter((id) => id !== t.id) : [...form.tradeIds, t.id])}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                            linked ? "border-accent/50 bg-accent-soft" : "border-border bg-surface hover:border-border-strong dark:bg-surface-2",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", t.direction === "LONG" ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss")}>
                              {t.direction === "LONG" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                            </span>
                            <span className="truncate text-[0.8rem] font-semibold">{t.pair}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className={cn("text-xs font-semibold tabular-nums", t.pnl > 0 ? "text-profit" : t.pnl < 0 ? "text-loss" : "text-muted")}>
                              {isClosed(t) ? formatSignedCurrency(t.pnl) : "open"}
                            </span>
                            <Link2 className={cn("h-3.5 w-3.5", linked ? "text-accent" : "text-faint")} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
