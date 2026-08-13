// Backtesting Series — pure, isomorphic helpers for the 168-item
// (instrument x year) backtesting plan. Mirrors the utils.ts pattern: the
// server persists raw BacktestItem rows, everything else (progress, pacing,
// the daily queue) is derived here from that flat list.

import type {
  BacktestingSummary,
  BacktestItem,
  DayHistoryEntry,
  InstrumentProgress,
  PaceStatus,
} from "./types";
import { dateKey } from "./utils";

// 28 instruments, alphabetical — the fixed order the daily queue walks.
export const INSTRUMENTS = [
  "AUDCAD",
  "AUDCHF",
  "AUDJPY",
  "AUDNZD",
  "AUDUSD",
  "CADJPY",
  "CHFJPY",
  "DXY",
  "EURAUD",
  "EURCAD",
  "EURCHF",
  "EURGBP",
  "EURJPY",
  "EURNZD",
  "EURUSD",
  "GBPAUD",
  "GBPCAD",
  "GBPCHF",
  "GBPJPY",
  "GBPNZD",
  "GBPUSD",
  "NZDCAD",
  "NZDCHF",
  "NZDJPY",
  "NZDUSD",
  "USDCAD",
  "USDCHF",
  "USDJPY",
] as const;

export const YEARS = [2020, 2021, 2022, 2023, 2024, 2025] as const;

export const DAILY_TARGET = 2;
export const TOTAL_ITEMS = INSTRUMENTS.length * YEARS.length; // 168
export const BACKTEST_START_DATE = "2026-08-14"; // yyyy-mm-dd, local

/** The fixed (instrument, year, sequence) triples the DB is seeded with. */
export function planSequence(): { instrument: string; year: number; sequence: number }[] {
  const plan: { instrument: string; year: number; sequence: number }[] = [];
  let sequence = 0;
  for (const instrument of INSTRUMENTS) {
    for (const year of YEARS) {
      plan.push({ instrument, year, sequence: sequence++ });
    }
  }
  return plan;
}

function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

/** Whole calendar days between two yyyy-mm-dd keys (local), `to` - `from`. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromMs = new Date(fy, fm - 1, fd).getTime();
  const toMs = new Date(ty, tm - 1, td).getTime();
  return Math.round((toMs - fromMs) / 86400000);
}

function byInstrumentThenYear(a: string, b: string): number {
  return a.localeCompare(b);
}

export function sortedItems(items: BacktestItem[]): BacktestItem[] {
  return items.slice().sort((a, b) => a.sequence - b.sequence);
}

/** Completed items grouped by the local calendar date they were completed on. */
export function historyByDate(items: BacktestItem[]): Map<string, BacktestItem[]> {
  const map = new Map<string, BacktestItem[]>();
  for (const item of items) {
    if (!item.completed || !item.completedAt) continue;
    const key = dateKey(new Date(item.completedAt));
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

function currentStreak(history: Map<string, BacktestItem[]>, todayKey: string): number {
  let streak = 0;
  let cursorKey = todayKey;
  if ((history.get(cursorKey)?.length ?? 0) < DAILY_TARGET) {
    cursorKey = addDaysToKey(cursorKey, -1);
  }
  // Never walk earlier than the plan's start date.
  while (daysBetween(BACKTEST_START_DATE, cursorKey) >= 0 && (history.get(cursorKey)?.length ?? 0) >= DAILY_TARGET) {
    streak += 1;
    cursorKey = addDaysToKey(cursorKey, -1);
  }
  return streak;
}

/** Derives every dashboard stat from the raw item list + "today". */
export function computeBacktestingSummary(items: BacktestItem[], todayKey: string): BacktestingSummary {
  const ordered = sortedItems(items);
  const total = ordered.length;
  const completed = ordered.filter((i) => i.completed).length;
  const remaining = total - completed;
  const percent = total ? (completed / total) * 100 : 0;

  // The queue is grouped into fixed pairs by sequence (0&1, 2&3, ...) so a
  // partially-checked pair stays put instead of reshuffling as items are
  // marked complete — it only advances once both items in the group are done.
  const firstIncomplete = ordered.find((i) => !i.completed);
  const currentGroupIndex = firstIncomplete ? Math.floor(firstIncomplete.sequence / DAILY_TARGET) : null;
  const todaysPlan =
    currentGroupIndex === null
      ? []
      : ordered.filter((i) => Math.floor(i.sequence / DAILY_TARGET) === currentGroupIndex);
  const nextUp =
    currentGroupIndex === null
      ? []
      : ordered.filter((i) => Math.floor(i.sequence / DAILY_TARGET) === currentGroupIndex + 1);

  const daysRemaining = Math.ceil(remaining / DAILY_TARGET);
  const expectedCompletionDate =
    remaining <= 0 ? null : addDaysToKey(todayKey, Math.max(daysRemaining - 1, 0));

  const daysElapsed = Math.max(daysBetween(BACKTEST_START_DATE, todayKey) + 1, 0);
  const dueByYesterday = Math.min(total, Math.max(daysElapsed - 1, 0) * DAILY_TARGET);
  let status: PaceStatus = "on_track";
  if (completed < dueByYesterday) status = "behind";
  else if (completed >= dueByYesterday + DAILY_TARGET) status = "ahead";

  const history = historyByDate(ordered);
  const completedTodayCount = history.get(todayKey)?.length ?? 0;
  const daysCompleted = Array.from(history.values()).filter((arr) => arr.length >= DAILY_TARGET).length;
  const streak = currentStreak(history, todayKey);

  return {
    total,
    completed,
    percent,
    remaining,
    daysRemaining,
    expectedCompletionDate,
    status,
    todaysPlan,
    nextUp,
    completedTodayCount,
    daysCompleted,
    currentStreak: streak,
  };
}

/** All 28 instruments (alphabetical) with their 6 years and completion. */
export function groupByInstrument(items: BacktestItem[]): InstrumentProgress[] {
  const byInstrument = new Map<string, BacktestItem[]>();
  for (const item of items) {
    const arr = byInstrument.get(item.instrument) ?? [];
    arr.push(item);
    byInstrument.set(item.instrument, arr);
  }
  return Array.from(byInstrument.entries())
    .sort(([a], [b]) => byInstrumentThenYear(a, b))
    .map(([instrument, yearItems]) => {
      const sorted = yearItems.slice().sort((a, b) => a.year - b.year);
      const completed = sorted.filter((i) => i.completed).length;
      return {
        instrument,
        items: sorted,
        completed,
        total: sorted.length,
        percent: sorted.length ? (completed / sorted.length) * 100 : 0,
      };
    });
}

/** Calendar history for a given month, one entry per day. */
export function monthHistory(items: BacktestItem[], year: number, month: number, todayKey: string): DayHistoryEntry[] {
  const history = historyByDate(items);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries: DayHistoryEntry[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day));
    const dayItems = history.get(key) ?? [];
    let status: DayHistoryEntry["status"];
    if (key > todayKey) status = "upcoming";
    else if (dayItems.length >= DAILY_TARGET) status = "completed";
    else if (dayItems.length > 0) status = "partial";
    else if (key < BACKTEST_START_DATE) status = "upcoming";
    else if (key === todayKey) status = "partial";
    else status = "missed";
    entries.push({ date: key, items: dayItems, status });
  }
  return entries;
}

export function formatDateLong(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export const STATUS_LABEL: Record<PaceStatus, string> = {
  ahead: "Ahead",
  on_track: "On Track",
  behind: "Behind",
};
