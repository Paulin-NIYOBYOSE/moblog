// Backtesting v2 — progress tracker for the DRIPDOLLAR backtest.
//
// 56 pair-years (28 instruments x 2024/2025), one per day from Nov 1 to
// Dec 31 2026 (finishing Dec 26 with 5 buffer days). Pure, isomorphic helpers
// in the same spirit as backtesting.ts: the server stores raw rows, progress
// and pacing are derived here.

import { INSTRUMENTS } from "./backtesting";
import type { BtItem } from "./types";
import { dateKey } from "./utils";

export const V2_INSTRUMENTS = INSTRUMENTS;
export const V2_YEARS = [2024, 2025] as const;
export const V2_DAILY_TARGET = 1;
export const V2_TOTAL = V2_INSTRUMENTS.length * V2_YEARS.length; // 56
export const V2_START = "2026-11-01";
export const V2_END = "2026-12-31";

/** Fixed (instrument, year, sequence) rows — alphabetical pair, ascending year. */
export function planSequenceV2(): { instrument: string; year: number; sequence: number }[] {
  const plan: { instrument: string; year: number; sequence: number }[] = [];
  let sequence = 0;
  for (const instrument of V2_INSTRUMENTS) {
    for (const year of V2_YEARS) plan.push({ instrument, year, sequence: sequence++ });
  }
  return plan;
}

function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((keyToDate(to).getTime() - keyToDate(from).getTime()) / 86400000);
}

export const V2_WINDOW_DAYS = daysBetweenKeys(V2_START, V2_END) + 1; // 61
export const V2_BUFFER_DAYS = V2_WINDOW_DAYS - Math.ceil(V2_TOTAL / V2_DAILY_TARGET); // 5

/** The calendar day a session is planned for in the original schedule. */
export function plannedDate(sequence: number): string {
  return addDaysKey(V2_START, Math.floor(sequence / V2_DAILY_TARGET));
}

export type V2Status = "not_started" | "ahead" | "on_track" | "behind" | "complete";

export const V2_STATUS_LABEL: Record<V2Status, string> = {
  not_started: "Not started",
  ahead: "Ahead",
  on_track: "On track",
  behind: "Behind",
  complete: "Complete",
};

export interface V2Summary {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
  today: BtItem | null; // the next session to work on (first incomplete)
  nextUp: BtItem[];
  completedToday: number;
  daysUntilStart: number; // > 0 before Nov 1
  windowDaysLeft: number; // calendar days left until Dec 31 (inclusive of today)
  status: V2Status;
  expectedCompletion: string | null;
  bufferLeft: number; // spare days at one session per day
  streak: number;
  activeDays: number;
}

export function completionsByDay(items: BtItem[]): Map<string, BtItem[]> {
  const map = new Map<string, BtItem[]>();
  for (const i of items) {
    if (!i.completed || !i.completedAt) continue;
    const k = dateKey(new Date(i.completedAt));
    const arr = map.get(k) ?? [];
    arr.push(i);
    map.set(k, arr);
  }
  return map;
}

export function computeV2Summary(items: BtItem[], todayKey: string): V2Summary {
  const ordered = items.slice().sort((a, b) => a.sequence - b.sequence);
  const total = ordered.length || V2_TOTAL;
  const completed = ordered.filter((i) => i.completed).length;
  const remaining = total - completed;
  const pending = ordered.filter((i) => !i.completed);
  const byDay = completionsByDay(ordered);

  const daysUntilStart = Math.max(0, daysBetweenKeys(todayKey, V2_START));
  const started = daysUntilStart === 0;
  const elapsed = started ? daysBetweenKeys(V2_START, todayKey) + 1 : 0; // days incl. today
  const dueByToday = Math.min(total, elapsed * V2_DAILY_TARGET);
  const dueByYesterday = Math.min(total, Math.max(0, elapsed - 1) * V2_DAILY_TARGET);
  const windowDaysLeft = started ? Math.max(0, daysBetweenKeys(todayKey, V2_END) + 1) : V2_WINDOW_DAYS;

  let status: V2Status;
  if (remaining === 0 && total > 0) status = "complete";
  else if (!started) status = completed > 0 ? "ahead" : "not_started";
  else if (completed < dueByYesterday) status = "behind";
  else if (completed >= dueByToday + V2_DAILY_TARGET) status = "ahead";
  else status = "on_track";

  const daysNeeded = Math.ceil(remaining / V2_DAILY_TARGET);
  const fromKey = started ? todayKey : V2_START;
  const expectedCompletion = remaining > 0 ? addDaysKey(fromKey, Math.max(0, daysNeeded - 1)) : null;

  // Streak: consecutive days (ending today, or yesterday if today isn't done
  // yet) with at least one completed session.
  let streak = 0;
  let cursor = todayKey;
  if (!byDay.has(cursor)) cursor = addDaysKey(cursor, -1);
  while (byDay.has(cursor)) {
    streak++;
    cursor = addDaysKey(cursor, -1);
  }

  return {
    total,
    completed,
    remaining,
    percent: total ? (completed / total) * 100 : 0,
    today: pending[0] ?? null,
    nextUp: pending.slice(1, 4),
    completedToday: byDay.get(todayKey)?.length ?? 0,
    daysUntilStart,
    windowDaysLeft,
    status,
    expectedCompletion,
    bufferLeft: windowDaysLeft - daysNeeded,
    streak,
    activeDays: byDay.size,
  };
}
