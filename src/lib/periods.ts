// Period filters shared by Analytics and the Journal — a preset (week, month,
// quarter, year, all, custom) anchored on a local yyyy-mm-dd day. Everything
// resolves to an inclusive [from, to] pair of date keys, compared as strings
// against dateKey()/effectiveDate() exactly like the existing date filters.

import { dateKey, MONTHS, todayKey } from "./utils";

export type PeriodPreset = "all" | "week" | "month" | "quarter" | "year" | "custom";

export interface Period {
  preset: PeriodPreset;
  /** Any day inside the period (yyyy-mm-dd). Ignored for "all" / "custom". */
  anchor: string;
  /** Custom range bounds, inclusive (yyyy-mm-dd). */
  from?: string;
  to?: string;
}

export interface DateRange {
  from: string;
  to: string;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(key: string, days: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** Trading weeks start on Monday. */
export function startOfWeek(key: string): string {
  const d = parseKey(key);
  const dow = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setDate(d.getDate() - dow);
  return dateKey(d);
}

export function periodRange(p: Period): DateRange | null {
  const a = parseKey(p.anchor || todayKey());
  const y = a.getFullYear();
  const m = a.getMonth();
  switch (p.preset) {
    case "all":
      return null;
    case "week": {
      const from = startOfWeek(p.anchor);
      return { from, to: addDays(from, 6) };
    }
    case "month":
      return { from: dateKey(new Date(y, m, 1)), to: dateKey(new Date(y, m + 1, 0)) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: dateKey(new Date(y, q, 1)), to: dateKey(new Date(y, q + 3, 0)) };
    }
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "custom":
      if (!p.from && !p.to) return null;
      return { from: p.from || "0000-01-01", to: p.to || "9999-12-31" };
  }
}

/** Steps a week/month/quarter/year period backwards or forwards. */
export function shiftPeriod(p: Period, delta: number): Period {
  const a = parseKey(p.anchor || todayKey());
  switch (p.preset) {
    case "week":
      return { ...p, anchor: addDays(p.anchor, delta * 7) };
    case "month":
      return { ...p, anchor: dateKey(new Date(a.getFullYear(), a.getMonth() + delta, 1)) };
    case "quarter":
      return { ...p, anchor: dateKey(new Date(a.getFullYear(), a.getMonth() + delta * 3, 1)) };
    case "year":
      return { ...p, anchor: dateKey(new Date(a.getFullYear() + delta, 0, 1)) };
    default:
      return p;
  }
}

function shortDate(key: string, withYear = false): string {
  return parseKey(key).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function periodLabel(p: Period): string {
  const a = parseKey(p.anchor || todayKey());
  switch (p.preset) {
    case "all":
      return "All time";
    case "week": {
      const r = periodRange(p)!;
      const from = parseKey(r.from);
      const to = parseKey(r.to);
      const sameMonth = from.getMonth() === to.getMonth();
      return sameMonth
        ? `${MONTHS[from.getMonth()].slice(0, 3)} ${from.getDate()} – ${to.getDate()}, ${to.getFullYear()}`
        : `${shortDate(r.from)} – ${shortDate(r.to, true)}`;
    }
    case "month":
      return `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
    case "quarter":
      return `Q${Math.floor(a.getMonth() / 3) + 1} ${a.getFullYear()}`;
    case "year":
      return String(a.getFullYear());
    case "custom": {
      if (!p.from && !p.to) return "Custom range";
      if (p.from && p.to) return `${shortDate(p.from, true)} – ${shortDate(p.to, true)}`;
      return p.from ? `From ${shortDate(p.from, true)}` : `Until ${shortDate(p.to!, true)}`;
    }
  }
}

/** The equally-long period immediately before `p` (for "vs previous" deltas). */
export function previousRange(p: Period): DateRange | null {
  if (p.preset === "all" || p.preset === "custom") return null;
  return periodRange(shiftPeriod(p, -1));
}

export function inRange(key: string, range: DateRange | null): boolean {
  if (!range) return true;
  return key >= range.from && key <= range.to;
}

export function monthKeyOf(key: string): string {
  return key.slice(0, 7);
}

/** ISO-ish week label used in weekly breakdown tables, e.g. "Oct 5 – 11". */
export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const s = parseKey(weekStart);
  const e = parseKey(end);
  return s.getMonth() === e.getMonth()
    ? `${MONTHS[s.getMonth()].slice(0, 3)} ${s.getDate()} – ${e.getDate()}`
    : `${shortDate(weekStart)} – ${shortDate(end)}`;
}

export function monthLabel(monthKey: string, long = false): string {
  const [y, m] = monthKey.split("-").map(Number);
  const name = MONTHS[(m || 1) - 1];
  return `${long ? name : name.slice(0, 3)} ${y}`;
}
