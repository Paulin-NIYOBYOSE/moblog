"use client";

import { ArrowDownRight, ArrowUpRight, Check, CheckCircle2, CircleDashed, Images, Pencil, Quote, Trash2, XCircle } from "lucide-react";
import { motion } from "motion/react";
import Badge from "@/components/ui/Badge";
import Drawer from "@/components/ui/Drawer";
import { AttachmentStrip } from "@/components/ui/Attachments";
import { formatDay, MOOD_LABELS, valenceOf, VALENCE_COLOR, type JournalRow } from "@/lib/journal";
import { CHECKLIST, gradeFor, GRADE_STYLE, type Grade } from "@/lib/strategy";
import type { Account } from "@/lib/types";
import { cn, formatSignedCurrency, isClosed } from "@/lib/utils";
import { MOOD_ICONS } from "./JournalEntryModal";

export function EmotionChip({ emotion, size = "sm" }: { emotion: string; size?: "sm" | "xs" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 font-medium text-foreground/85",
        size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: VALENCE_COLOR[valenceOf(emotion)] }} />
      {emotion}
    </span>
  );
}

export function MoodBadge({ mood }: { mood: number | null }) {
  if (!mood) return null;
  const Icon = MOOD_ICONS[mood - 1];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" title={`Mood: ${MOOD_LABELS[mood - 1]}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {MOOD_LABELS[mood - 1]}
    </span>
  );
}

export function GradeChip({ grade }: { grade: Grade | null }) {
  if (!grade) return null;
  return <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-bold", GRADE_STYLE[grade].chip)}>{grade} setup</span>;
}

export function PlanBadge({ followed }: { followed: boolean | null }) {
  if (followed === null) return null;
  return followed ? (
    <Badge tone="profit" icon={CheckCircle2}>
      Followed plan
    </Badge>
  ) : (
    <Badge tone="loss" icon={XCircle}>
      Broke plan
    </Badge>
  );
}

/** Timeline card for one entry. */
export function JournalEntryCard({
  row,
  accountName,
  index,
  onOpen,
}: {
  row: JournalRow;
  accountName: string | null;
  index: number;
  onOpen: () => void;
}) {
  const e = row.entry;
  const d = new Date(`${e.day}T00:00:00`);
  const emotions = Array.from(new Set([...e.emotionsBefore, ...e.emotionsAfter]));
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
      className="group flex w-full gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-card transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-md sm:p-5"
    >
      <div className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-border bg-surface-2 py-2 sm:w-14">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {d.toLocaleDateString("en-US", { weekday: "short" })}
        </span>
        <span className="text-xl font-semibold leading-tight">{d.getDate()}</span>
        <span className="text-[10px] text-faint">{d.toLocaleDateString("en-US", { month: "short" })}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <h3 className="truncate text-[0.95rem] font-semibold tracking-tight">{e.title || "Journal entry"}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <MoodBadge mood={e.mood} />
              {accountName && <span className="text-xs text-muted">{accountName}</span>}
              <GradeChip grade={gradeFor(e.checklist)} />
              <PlanBadge followed={e.followedPlan} />
            </div>
          </div>
          <div className="text-right">
            {row.traded ? (
              <>
                <div className={cn("text-base font-semibold", row.pnl > 0 ? "text-profit" : row.pnl < 0 ? "text-loss" : "text-muted")}>
                  {formatSignedCurrency(row.pnl)}
                </div>
                <div className="text-[11px] text-muted">
                  {row.closed} trade{row.closed === 1 ? "" : "s"} · {row.wins}W {row.losses}L
                </div>
              </>
            ) : (
              <span className="text-xs text-faint">No trades</span>
            )}
          </div>
        </div>

        {(emotions.length > 0 || e.mistakes.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {emotions.slice(0, 5).map((em) => (
              <EmotionChip key={em} emotion={em} />
            ))}
            {emotions.length > 5 && <span className="text-[11px] text-muted">+{emotions.length - 5}</span>}
            {e.mistakes.slice(0, 3).map((m) => (
              <Badge key={m} tone="loss">
                {m}
              </Badge>
            ))}
          </div>
        )}

        {(e.notes || e.lessons) && (
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{e.notes || e.lessons}</p>
        )}

        {e.attachments.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex -space-x-2">
              {e.attachments.slice(0, 4).map((a) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={a.id}
                  src={`/api/attachments/${a.id}`}
                  alt=""
                  loading="lazy"
                  className="h-9 w-14 rounded-lg border-2 border-card object-cover"
                />
              ))}
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
              <Images className="h-3 w-3" /> {e.attachments.length}
            </span>
          </div>
        )}

        {e.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {e.tags.map((t) => (
              <span key={t} className="text-[11px] font-medium text-accent">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.button>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      {children}
    </div>
  );
}

/** Full read view of an entry. */
export function JournalEntryDrawer({
  row,
  accounts,
  onClose,
  onEdit,
  onDelete,
  onRemoveImage,
  onEditImage,
}: {
  row: JournalRow | null;
  accounts: Account[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRemoveImage: (attachmentId: string) => Promise<void>;
  onEditImage: (attachmentId: string, patch: { name?: string; caption?: string }) => Promise<void>;
}) {
  const e = row?.entry;
  const accountName = e?.accountId ? accounts.find((a) => a.id === e.accountId)?.name ?? null : null;
  return (
    <Drawer
      open={Boolean(row)}
      onClose={onClose}
      title={e ? e.title || "Journal entry" : ""}
      subtitle={e ? `${formatDay(e.day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${accountName ? ` · ${accountName}` : " · All accounts"}` : ""}
      footer={
        <>
          <button type="button" onClick={onDelete} className="btn btn-danger btn-icon" aria-label="Delete entry">
            <Trash2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={onEdit} className="btn btn-primary ml-auto">
            <Pencil className="h-4 w-4" /> Edit entry
          </button>
        </>
      }
    >
      {row && e && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="eyebrow">Day P&L</div>
              <div className={cn("mt-1 text-lg font-semibold", row.pnl > 0 ? "text-profit" : row.pnl < 0 ? "text-loss" : "")}>
                {row.traded ? formatSignedCurrency(row.pnl) : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="eyebrow">Mood</div>
              <div className="mt-1 text-sm font-semibold">{e.mood ? MOOD_LABELS[e.mood - 1] : "—"}</div>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="eyebrow">Setup</div>
              <div className="mt-1 text-sm font-semibold">
                {gradeFor(e.checklist) ? `${gradeFor(e.checklist)} · ${e.checklist.length}/${CHECKLIST.length}` : "—"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <PlanBadge followed={e.followedPlan} />
            {e.tags.map((t) => (
              <Badge key={t} tone="accent">
                #{t}
              </Badge>
            ))}
          </div>

          {row.trades.length > 0 && (
            <Block label={`Trades (${row.trades.length})`}>
              <div className="space-y-1.5">
                {row.trades.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", t.direction === "LONG" ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss")}>
                        {t.direction === "LONG" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      </span>
                      <span className="text-sm font-medium">{t.pair}</span>
                      {t.setup && <span className="text-xs text-muted">{t.setup}</span>}
                    </span>
                    <span className={cn("text-sm font-semibold tabular-nums", t.pnl > 0 ? "text-profit" : t.pnl < 0 ? "text-loss" : "text-muted")}>
                      {isClosed(t) ? formatSignedCurrency(t.pnl) : "open"}
                    </span>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {e.checklist.length > 0 && (
            <Block label="DRIPDOLLAR checklist">
              <ul className="grid gap-1 sm:grid-cols-2">
                {CHECKLIST.map((c) => {
                  const ok = e.checklist.includes(c.key);
                  return (
                    <li key={c.key} className="flex items-center gap-2 text-[12.5px]">
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full", ok ? "bg-profit text-white" : "border border-border-strong text-faint")}>
                        {ok ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <CircleDashed className="h-2.5 w-2.5" />}
                      </span>
                      <span className={ok ? "" : "text-muted"}>{c.label}</span>
                    </li>
                  );
                })}
              </ul>
            </Block>
          )}

          {(e.emotionsBefore.length > 0 || e.emotionsAfter.length > 0) && (
            <Block label="Emotions">
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Set([...e.emotionsBefore, ...e.emotionsAfter])).map((em) => (
                  <EmotionChip key={em} emotion={em} />
                ))}
              </div>
            </Block>
          )}

          {e.mistakes.length > 0 && (
            <Block label="Mistakes">
              <div className="flex flex-wrap gap-1.5">
                {e.mistakes.map((m) => (
                  <Badge key={m} tone="loss">
                    {m}
                  </Badge>
                ))}
              </div>
            </Block>
          )}

          {e.premarket && (
            <Block label="Plan">
              <p className="prose-note">{e.premarket}</p>
            </Block>
          )}
          {e.notes && (
            <Block label="Notes">
              <p className="prose-note">{e.notes}</p>
            </Block>
          )}
          {e.lessons && (
            <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gold-soft p-4">
              <Quote className="absolute right-3 top-3 h-8 w-8 text-gold/25" />
              <div className="eyebrow mb-1.5 text-gold">Lesson</div>
              <p className="prose-note">{e.lessons}</p>
            </div>
          )}

          {e.attachments.length > 0 && (
            <Block label={`Images (${e.attachments.length})`}>
              <AttachmentStrip attachments={e.attachments} size="lg" onDelete={onRemoveImage} onEdit={onEditImage} />
            </Block>
          )}
        </div>
      )}
    </Drawer>
  );
}
