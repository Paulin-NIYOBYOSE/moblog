// Journal analytics — pure helpers that join journal entries to the trades of
// the day they reflect on. P&L is never stored on an entry: it's always
// derived from the trade log (via the canonical isClosed / effectiveDate /
// dateKey helpers) so the two can't drift apart.

import type { JournalEntry, Trade } from "./types";
import { dateKey, effectiveDate, isClosed } from "./utils";
import { addDays, monthKeyOf, startOfWeek, type DateRange, inRange } from "./periods";
import { CHECKLIST, gradeFor, GRADES, type Grade } from "./strategy";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const MOOD_LABELS = ["Rough", "Low", "Neutral", "Good", "Great"];
export const DISCIPLINE_LABELS = ["Poor", "Shaky", "Okay", "Solid", "Flawless"];

export type Valence = "positive" | "negative" | "neutral";

export const EMOTIONS: { label: string; valence: Valence }[] = [
  { label: "Calm", valence: "positive" },
  { label: "Confident", valence: "positive" },
  { label: "Focused", valence: "positive" },
  { label: "Patient", valence: "positive" },
  { label: "Disciplined", valence: "positive" },
  { label: "Neutral", valence: "neutral" },
  { label: "Anxious", valence: "negative" },
  { label: "Fearful", valence: "negative" },
  { label: "FOMO", valence: "negative" },
  { label: "Greedy", valence: "negative" },
  { label: "Impatient", valence: "negative" },
  { label: "Frustrated", valence: "negative" },
  { label: "Revengeful", valence: "negative" },
  { label: "Overconfident", valence: "negative" },
  { label: "Tired", valence: "negative" },
];

export const EMOTION_LABELS = EMOTIONS.map((e) => e.label);

export function valenceOf(emotion: string): Valence {
  return EMOTIONS.find((e) => e.label === emotion)?.valence ?? "neutral";
}

export const VALENCE_COLOR: Record<Valence, string> = {
  positive: "var(--profit)",
  negative: "var(--loss)",
  neutral: "var(--faint)",
};

export const MISTAKES = [
  "Moved stop loss",
  "Early exit",
  "Late entry",
  "Chased entry",
  "Oversized position",
  "Revenge trade",
  "Overtrading",
  "No confirmation",
  "Ignored HTF bias",
  "Missed valid setup",
];

// ---------------------------------------------------------------------------
// Joining entries to trades
// ---------------------------------------------------------------------------

export function tradeDay(t: Trade): string {
  return dateKey(new Date(effectiveDate(t)));
}

/**
 * Trades an entry reflects on: its explicit links when set, otherwise every
 * trade realized that day — scoped to the entry's account, or to the active
 * account filter for entries that aren't tied to one.
 */
export function tradesForEntry(entry: JournalEntry, trades: Trade[], scopeAccountId: string | null): Trade[] {
  if (entry.tradeIds.length) {
    const ids = new Set(entry.tradeIds);
    return trades.filter((t) => ids.has(t.id));
  }
  const account = entry.accountId ?? scopeAccountId;
  return trades.filter((t) => tradeDay(t) === entry.day && (!account || t.accountId === account));
}

export interface JournalRow {
  entry: JournalEntry;
  trades: Trade[];
  pnl: number;
  closed: number;
  wins: number;
  losses: number;
  traded: boolean;
}

export function buildRows(entries: JournalEntry[], trades: Trade[], scopeAccountId: string | null): JournalRow[] {
  return entries.map((entry) => {
    const list = tradesForEntry(entry, trades, scopeAccountId);
    const closed = list.filter(isClosed);
    return {
      entry,
      trades: list,
      pnl: closed.reduce((s, t) => s + t.pnl, 0),
      closed: closed.length,
      wins: closed.filter((t) => t.pnl > 0).length,
      losses: closed.filter((t) => t.pnl < 0).length,
      traded: closed.length > 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface JournalFilters {
  range: DateRange | null;
  accountId: string | null; // null = all accounts
  search: string;
  emotions: string[];
  mistakes: string[];
  tags: string[];
  plan: "all" | "followed" | "broken";
}

export function filterEntries(entries: JournalEntry[], f: JournalFilters): JournalEntry[] {
  const q = f.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (!inRange(e.day, f.range)) return false;
    if (f.accountId && e.accountId && e.accountId !== f.accountId) return false;
    if (f.emotions.length && !f.emotions.some((x) => e.emotionsBefore.includes(x) || e.emotionsAfter.includes(x))) return false;
    if (f.mistakes.length && !f.mistakes.some((x) => e.mistakes.includes(x))) return false;
    if (f.tags.length && !f.tags.some((x) => e.tags.includes(x))) return false;
    if (f.plan === "followed" && e.followedPlan !== true) return false;
    if (f.plan === "broken" && e.followedPlan !== false) return false;
    if (q) {
      const hay = [e.title, e.premarket, e.notes, e.lessons, ...e.tags, ...e.mistakes, ...e.emotionsBefore, ...e.emotionsAfter]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Summary & impact analytics
// ---------------------------------------------------------------------------

function avg(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function isWeekend(key: string): boolean {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

/** Consecutive weekdays (weekends skipped) with at least one entry. */
export function journalStreak(entries: JournalEntry[], today: string): number {
  const days = new Set(entries.map((e) => e.day));
  let cursor = today;
  while (isWeekend(cursor)) cursor = addDays(cursor, -1);
  if (!days.has(cursor)) {
    cursor = addDays(cursor, -1);
    while (isWeekend(cursor)) cursor = addDays(cursor, -1);
  }
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
    while (isWeekend(cursor) && !days.has(cursor)) cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface JournalSummary {
  entries: number;
  tradedDays: number;
  avgMood: number | null;
  avgDiscipline: number | null;
  planAnswered: number;
  planFollowed: number;
  adherencePct: number | null;
  pnl: number;
  greenDays: number;
  redDays: number;
  avgPnlFollowed: number | null;
  avgPnlBroken: number | null;
  images: number;
  coveragePct: number | null; // journaled trading days / trading days
  setups: number; // entries with any checklist item ticked
  avgChecklist: number | null; // avg items held (of 13) on setup days
  aPlusSetups: number;
  topMistake: { label: string; count: number; pnl: number } | null;
}

export function summarize(rows: JournalRow[], tradingDaysInScope: number): JournalSummary {
  const traded = rows.filter((r) => r.traded);
  const answered = rows.filter((r) => r.entry.followedPlan !== null);
  const followed = answered.filter((r) => r.entry.followedPlan === true);
  const broken = answered.filter((r) => r.entry.followedPlan === false);
  const mistakes = mistakeImpact(rows);
  const journaledTradingDays = new Set(traded.map((r) => r.entry.day)).size;
  const setupRows = rows.filter((r) => r.entry.checklist.length > 0);
  return {
    entries: rows.length,
    tradedDays: traded.length,
    avgMood: avg(rows.map((r) => r.entry.mood).filter((v): v is number => v !== null)),
    avgDiscipline: avg(rows.map((r) => r.entry.discipline).filter((v): v is number => v !== null)),
    planAnswered: answered.length,
    planFollowed: followed.length,
    adherencePct: answered.length ? (followed.length / answered.length) * 100 : null,
    pnl: rows.reduce((s, r) => s + r.pnl, 0),
    greenDays: traded.filter((r) => r.pnl > 0).length,
    redDays: traded.filter((r) => r.pnl < 0).length,
    avgPnlFollowed: avg(followed.filter((r) => r.traded).map((r) => r.pnl)),
    avgPnlBroken: avg(broken.filter((r) => r.traded).map((r) => r.pnl)),
    images: rows.reduce((s, r) => s + r.entry.attachments.length, 0),
    coveragePct: tradingDaysInScope ? Math.min(100, (journaledTradingDays / tradingDaysInScope) * 100) : null,
    setups: setupRows.length,
    avgChecklist: avg(setupRows.map((r) => r.entry.checklist.length)),
    aPlusSetups: setupRows.filter((r) => gradeFor(r.entry.checklist) === "A+").length,
    topMistake: mistakes.length ? { label: mistakes[0].label, count: mistakes[0].count, pnl: mistakes[0].totalPnl } : null,
  };
}

export interface ImpactRow {
  label: string;
  count: number;
  tradedCount: number;
  totalPnl: number;
  avgPnl: number;
  winDayPct: number;
  valence?: Valence;
}

function impact(rows: JournalRow[], pick: (r: JournalRow) => string[]): ImpactRow[] {
  const map = new Map<string, JournalRow[]>();
  for (const r of rows) {
    for (const k of new Set(pick(r))) {
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
  }
  return Array.from(map.entries())
    .map(([label, list]) => {
      const traded = list.filter((r) => r.traded);
      const total = traded.reduce((s, r) => s + r.pnl, 0);
      return {
        label,
        count: list.length,
        tradedCount: traded.length,
        totalPnl: total,
        avgPnl: traded.length ? total / traded.length : 0,
        winDayPct: traded.length ? (traded.filter((r) => r.pnl > 0).length / traded.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function emotionImpact(rows: JournalRow[], when: "before" | "after" | "any"): ImpactRow[] {
  return impact(rows, (r) =>
    when === "before" ? r.entry.emotionsBefore : when === "after" ? r.entry.emotionsAfter : [...r.entry.emotionsBefore, ...r.entry.emotionsAfter],
  ).map((row) => ({ ...row, valence: valenceOf(row.label) }));
}

export function mistakeImpact(rows: JournalRow[]): ImpactRow[] {
  return impact(rows, (r) => r.entry.mistakes).sort((a, b) => a.totalPnl - b.totalPnl || b.count - a.count);
}

export function tagImpact(rows: JournalRow[]): ImpactRow[] {
  return impact(rows, (r) => r.entry.tags);
}

export interface ScaleBucket {
  level: number;
  label: string;
  count: number;
  tradedCount: number;
  avgPnl: number;
  winDayPct: number;
}

export function scaleBuckets(rows: JournalRow[], key: "mood" | "discipline"): ScaleBucket[] {
  const labels = key === "mood" ? MOOD_LABELS : DISCIPLINE_LABELS;
  return labels.map((label, i) => {
    const level = i + 1;
    const list = rows.filter((r) => r.entry[key] === level);
    const traded = list.filter((r) => r.traded);
    const total = traded.reduce((s, r) => s + r.pnl, 0);
    return {
      level,
      label,
      count: list.length,
      tradedCount: traded.length,
      avgPnl: traded.length ? total / traded.length : 0,
      winDayPct: traded.length ? (traded.filter((r) => r.pnl > 0).length / traded.length) * 100 : 0,
    };
  });
}

export interface PeriodRow {
  key: string;
  entries: number;
  avgMood: number | null;
  avgDiscipline: number | null;
  avgChecklist: number | null;
  adherencePct: number | null;
  pnl: number;
  greenDays: number;
  redDays: number;
  mistakes: number;
}

function periodRows(rows: JournalRow[], keyFn: (day: string) => string): PeriodRow[] {
  const map = new Map<string, JournalRow[]>();
  for (const r of rows) {
    const k = keyFn(r.entry.day);
    const arr = map.get(k) ?? [];
    arr.push(r);
    map.set(k, arr);
  }
  return Array.from(map.entries())
    .map(([key, list]) => {
      const answered = list.filter((r) => r.entry.followedPlan !== null);
      return {
        key,
        entries: list.length,
        avgMood: avg(list.map((r) => r.entry.mood).filter((v): v is number => v !== null)),
        avgDiscipline: avg(list.map((r) => r.entry.discipline).filter((v): v is number => v !== null)),
        avgChecklist: avg(list.filter((r) => r.entry.checklist.length).map((r) => r.entry.checklist.length)),
        adherencePct: answered.length ? (answered.filter((r) => r.entry.followedPlan).length / answered.length) * 100 : null,
        pnl: list.reduce((s, r) => s + r.pnl, 0),
        greenDays: list.filter((r) => r.traded && r.pnl > 0).length,
        redDays: list.filter((r) => r.traded && r.pnl < 0).length,
        mistakes: list.reduce((s, r) => s + r.entry.mistakes.length, 0),
      };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
}

export function weeklyRows(rows: JournalRow[]): PeriodRow[] {
  return periodRows(rows, startOfWeek);
}

export function monthlyRows(rows: JournalRow[]): PeriodRow[] {
  return periodRows(rows, monthKeyOf);
}

/** Days in the range that had at least one realized trade (account-scoped). */
export function tradingDaysIn(trades: Trade[], range: DateRange | null, accountId: string | null): number {
  const set = new Set<string>();
  for (const t of trades) {
    if (!isClosed(t)) continue;
    if (accountId && t.accountId !== accountId) continue;
    const d = tradeDay(t);
    if (inRange(d, range)) set.add(d);
  }
  return set.size;
}

/** Discipline & mood over time, chronological (one point per entry day). */
export interface TrendPoint {
  day: string;
  label: string;
  mood: number | null;
  discipline: number | null;
  moodAvg: number | null;
  disciplineAvg: number | null;
  pnl: number;
}

export function trendSeries(rows: JournalRow[], window = 5): TrendPoint[] {
  const byDay = new Map<string, JournalRow[]>();
  for (const r of rows) {
    const arr = byDay.get(r.entry.day) ?? [];
    arr.push(r);
    byDay.set(r.entry.day, arr);
  }
  const points = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      label: new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      mood: avg(list.map((r) => r.entry.mood).filter((v): v is number => v !== null)),
      discipline: avg(list.map((r) => r.entry.discipline).filter((v): v is number => v !== null)),
      pnl: list.reduce((s, r) => s + r.pnl, 0),
    }));
  // Trailing rolling mean so the trend reads through day-to-day noise.
  return points.map((p, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    const m = avg(slice.map((x) => x.mood).filter((v): v is number => v !== null));
    const d = avg(slice.map((x) => x.discipline).filter((v): v is number => v !== null));
    return {
      ...p,
      moodAvg: m === null ? null : Number(m.toFixed(2)),
      disciplineAvg: d === null ? null : Number(d.toFixed(2)),
    };
  });
}

export function allTags(entries: JournalEntry[]): string[] {
  return Array.from(new Set(entries.flatMap((e) => e.tags))).sort();
}

export function formatDay(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" }): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", opts);
}

// ---------------------------------------------------------------------------
// Strategy (DRIPDOLLAR A+ checklist) analytics
// ---------------------------------------------------------------------------

export interface GradeBucket {
  grade: Grade | "None";
  label: string;
  count: number;
  tradedCount: number;
  avgPnl: number;
  totalPnl: number;
  winDayPct: number;
}

/** Day P&L grouped by the setup grade logged in the entry. */
export function gradeBuckets(rows: JournalRow[]): GradeBucket[] {
  const keys: (Grade | "None")[] = [...GRADES, "None"];
  return keys.map((g) => {
    const list = rows.filter((r) => (gradeFor(r.entry.checklist) ?? "None") === g);
    const traded = list.filter((r) => r.traded);
    const total = traded.reduce((s, r) => s + r.pnl, 0);
    return {
      grade: g,
      label: g === "None" ? "No setup" : g,
      count: list.length,
      tradedCount: traded.length,
      avgPnl: traded.length ? total / traded.length : 0,
      totalPnl: total,
      winDayPct: traded.length ? (traded.filter((r) => r.pnl > 0).length / traded.length) * 100 : 0,
    };
  });
}

export interface ChecklistImpactRow {
  key: string;
  label: string;
  tf: string;
  heldPct: number; // share of setup days where the item held
  avgHeld: number | null; // avg day P&L when it held
  avgMissed: number | null; // avg day P&L when it didn't
  edge: number | null; // avgHeld - avgMissed
}

/**
 * For every checklist rule: how often it held on setup days, and the average
 * day P&L with vs without it — i.e. which rules actually pay.
 */
export function checklistImpact(rows: JournalRow[]): ChecklistImpactRow[] {
  const setupDays = rows.filter((r) => r.entry.checklist.length > 0);
  const traded = setupDays.filter((r) => r.traded);
  return CHECKLIST.map((c) => {
    const held = traded.filter((r) => r.entry.checklist.includes(c.key));
    const missed = traded.filter((r) => !r.entry.checklist.includes(c.key));
    const avgHeld = avg(held.map((r) => r.pnl));
    const avgMissed = avg(missed.map((r) => r.pnl));
    return {
      key: c.key,
      label: c.label,
      tf: c.tf,
      heldPct: setupDays.length ? (setupDays.filter((r) => r.entry.checklist.includes(c.key)).length / setupDays.length) * 100 : 0,
      avgHeld,
      avgMissed,
      edge: avgHeld !== null && avgMissed !== null ? avgHeld - avgMissed : null,
    };
  });
}
