import type { DayBoundary, Timeframe } from "./types";

// All internal timestamps are unix seconds in UTC. Time zones only matter when
// (a) interpreting imported wall-clock times, (b) aligning H4/D1/W1 candles to
// a trading-day convention and (c) formatting for display.

export const TIMEFRAMES: Timeframe[] = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"];

export const TF_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14_400,
  D1: 86_400,
  W1: 604_800,
};

export const TF_LABEL: Record<Timeframe, string> = {
  M1: "1 minute",
  M5: "5 minutes",
  M15: "15 minutes",
  M30: "30 minutes",
  H1: "1 hour",
  H4: "4 hours",
  D1: "1 day",
  W1: "1 week",
};

export function timeframeFromSeconds(seconds: number): Timeframe | null {
  return (TIMEFRAMES.find((tf) => TF_SECONDS[tf] === seconds) as Timeframe | undefined) ?? null;
}

/** Chart timeframes that can be built from a dataset of `base` resolution. */
export function availableTimeframes(base: Timeframe): Timeframe[] {
  const b = TF_SECONDS[base];
  return TIMEFRAMES.filter((tf) => TF_SECONDS[tf] >= b && TF_SECONDS[tf] % b === 0);
}

// ---------------------------------------------------------------------------
// Time zone offsets
// ---------------------------------------------------------------------------

/**
 * Pseudo zone for broker "server time": New York time + 7h, i.e. GMT+2 in
 * winter and GMT+3 in US summer time. Midnight in this zone is 17:00 New York.
 */
export const NY_PLUS_7 = "NY+7";

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, Map<number, number>>();

function fixedOffsetOf(tz: string): number | null {
  if (tz === "UTC" || tz === "Etc/UTC" || tz === "GMT" || tz === "Etc/GMT") return 0;
  const m = tz.match(/^Etc\/GMT([+-])(\d{1,2})$/);
  // IANA Etc/GMT zones have inverted signs: Etc/GMT+5 is UTC−5.
  if (m) return (m[1] === "+" ? -1 : 1) * Number(m[2]) * 3600;
  return null;
}

function intlOffset(tz: string, utcSec: number): number {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(tz, fmt);
  }
  const parts = fmt.formatToParts(new Date(utcSec * 1000));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) / 1000;
  return Math.round((asUtc - Math.floor(utcSec)) / 60) * 60;
}

/** Offset of `tz` from UTC in seconds at instant `utcSec` (UTC+2 → 7200). */
export function tzOffset(tz: string, utcSec: number): number {
  const fixed = fixedOffsetOf(tz);
  if (fixed !== null) return fixed;
  if (tz === NY_PLUS_7) return tzOffset("America/New_York", utcSec) + 7 * 3600;
  let cache = offsetCache.get(tz);
  if (!cache) {
    cache = new Map();
    offsetCache.set(tz, cache);
  }
  const hourKey = Math.floor(utcSec / 3600);
  let off = cache.get(hourKey);
  if (off === undefined) {
    off = intlOffset(tz, hourKey * 3600);
    if (cache.size > 200_000) cache.clear();
    cache.set(hourKey, off);
  }
  return off;
}

/**
 * Convert a wall-clock time (expressed as if it were UTC seconds) in zone `tz`
 * to a real UTC instant. Nonexistent/ambiguous DST hours resolve to the first
 * matching offset — documented as a known limitation.
 */
export function wallToUtc(wallSec: number, tz: string): number {
  const fixed = fixedOffsetOf(tz);
  if (fixed !== null) return wallSec - fixed;
  const guess = wallSec - tzOffset(tz, wallSec);
  return wallSec - tzOffset(tz, guess);
}

export function isValidTimezone(tz: string): boolean {
  if (tz === NY_PLUS_7 || fixedOffsetOf(tz) !== null) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const SOURCE_TIMEZONES: { value: string; label: string }[] = [
  { value: "UTC", label: "UTC / GMT (Dukascopy “GMT time”)" },
  { value: "Etc/GMT+5", label: "EST fixed, UTC−5, no DST (HistData)" },
  { value: NY_PLUS_7, label: "Broker server time, GMT+2/+3 (NY close)" },
  { value: "America/New_York", label: "New York (with DST)" },
  { value: "Europe/London", label: "London (with DST)" },
  { value: "Europe/Berlin", label: "Central Europe (with DST)" },
  { value: "Etc/GMT-2", label: "Fixed UTC+2" },
  { value: "Etc/GMT-3", label: "Fixed UTC+3" },
  { value: "Asia/Tokyo", label: "Tokyo" },
];

export const DISPLAY_TIMEZONES: { value: string; label: string }[] = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York" },
  { value: "Europe/London", label: "London" },
  { value: NY_PLUS_7, label: "Server (GMT+2/+3)" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "local", label: "This device" },
];

export function resolveDisplayTz(tz: string): string {
  if (tz === "local") {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }
  return tz;
}

// ---------------------------------------------------------------------------
// Candle bucket alignment
// ---------------------------------------------------------------------------

const EPOCH_MONDAY_OFFSET = 4 * 86_400; // 1970-01-05 was a Monday

/** Seconds to add to a UTC time to get the trading-day "local" clock. */
export function boundaryShift(boundary: DayBoundary, utcSec: number): number {
  return boundary === "utc" ? 0 : tzOffset(NY_PLUS_7, utcSec);
}

/**
 * Key of the candle bucket that `utcSec` belongs to, in shifted local seconds.
 * Two base bars share a chart candle iff their keys are equal.
 */
export function bucketKey(utcSec: number, tf: Timeframe, boundary: DayBoundary): number {
  const p = TF_SECONDS[tf];
  if (p <= 3600) return Math.floor(utcSec / p) * p;
  const local = utcSec + boundaryShift(boundary, utcSec);
  if (tf === "W1") {
    return Math.floor((local - EPOCH_MONDAY_OFFSET) / p) * p + EPOCH_MONDAY_OFFSET;
  }
  return Math.floor(local / p) * p;
}

/** UTC open time of the bucket containing `utcSec`. */
export function bucketStart(utcSec: number, tf: Timeframe, boundary: DayBoundary): number {
  const p = TF_SECONDS[tf];
  if (p <= 3600) return Math.floor(utcSec / p) * p;
  const key = bucketKey(utcSec, tf, boundary);
  return key - boundaryShift(boundary, utcSec);
}

// ---------------------------------------------------------------------------
// Market structure helpers
// ---------------------------------------------------------------------------

/** Day of week (0=Sun) of a UTC instant in a zone. */
export function weekdayIn(utcSec: number, tz: string): number {
  const local = utcSec + tzOffset(tz, utcSec);
  return new Date(local * 1000).getUTCDay();
}

export function hourIn(utcSec: number, tz: string): number {
  const local = utcSec + tzOffset(tz, utcSec);
  const d = new Date(local * 1000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/**
 * Does a gap between two bars cover the weekly forex closure (Fri ~17:00 →
 * Sun ~17:00 New York)? Such gaps are expected and not reported as missing.
 */
export function isWeekendGap(fromSec: number, toSec: number): boolean {
  if (toSec - fromSec > 4 * 86_400) return false;
  // Work in server time (NY+7), where the week runs Mon 00:00 → Fri 24:00.
  const fromDay = weekdayIn(fromSec, NY_PLUS_7);
  const toDay = weekdayIn(toSec, NY_PLUS_7);
  const fromHour = hourIn(fromSec, NY_PLUS_7);
  const toHour = hourIn(toSec, NY_PLUS_7);
  const startsLateFriOrWeekend = (fromDay === 5 && fromHour >= 20) || fromDay === 6 || fromDay === 0;
  const endsEarlyMonOrWeekend = (toDay === 1 && toHour <= 3) || toDay === 0 || toDay === 6;
  return startsLateFriOrWeekend && endsEarlyMonOrWeekend;
}

export type MarketSession = "Asia" | "London" | "London/NY overlap" | "New York";

export const MARKET_SESSIONS: MarketSession[] = ["Asia", "London", "London/NY overlap", "New York"];

/** DST-aware session of an instant: London and New York are 08:00–17:00 local. */
export function marketSessionOf(utcSec: number): MarketSession {
  const lon = hourIn(utcSec, "Europe/London");
  const ny = hourIn(utcSec, "America/New_York");
  const inLon = lon >= 8 && lon < 17;
  const inNy = ny >= 8 && ny < 17;
  if (inLon && inNy) return "London/NY overlap";
  if (inLon) return "London";
  if (inNy) return "New York";
  return "Asia";
}

/** Trading weekday (Mon..Fri) using the 17:00 New York roll. */
export function tradingWeekday(utcSec: number): number {
  return weekdayIn(utcSec, NY_PLUS_7);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(tz: string, opts: Intl.DateTimeFormatOptions, key: string) {
  const k = `${tz}|${key}`;
  let f = dtfCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" });
    dtfCache.set(k, f);
  }
  return f;
}

/** Shift to the display zone, then format as UTC — supports NY+7 too. */
export function formatInTz(
  utcSec: number,
  tz: string,
  style: "datetime" | "date" | "time" | "short" | "month" | "tick-day" = "datetime",
): string {
  const zone = resolveDisplayTz(tz);
  const shifted = new Date((utcSec + tzOffset(zone, utcSec)) * 1000);
  switch (style) {
    case "date":
      return dtf(zone, { weekday: "short", day: "2-digit", month: "short", year: "numeric" }, style).format(shifted);
    case "time":
      return dtf(zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, style).format(shifted);
    case "short":
      return dtf(zone, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, style).format(shifted);
    case "month":
      return dtf(zone, { month: "short", year: "numeric" }, style).format(shifted);
    case "tick-day":
      return dtf(zone, { day: "2-digit", month: "short" }, style).format(shifted);
    default:
      return dtf(
        zone,
        { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
        style,
      ).format(shifted);
  }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export function monthKeyUtc(utcSec: number): string {
  const d = new Date(utcSec * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** First second of the UTC month that contains `utcSec`, offset by `delta` months. */
export function monthStartUtc(utcSec: number, delta = 0): number {
  const d = new Date(utcSec * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1) / 1000;
}

/** yyyy-mm-ddThh:mm for <input type="datetime-local"> in a given zone. */
export function toInputValue(utcSec: number, tz: string): string {
  const zone = resolveDisplayTz(tz);
  const d = new Date((utcSec + tzOffset(zone, utcSec)) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function fromInputValue(value: string, tz: string): number | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0) / 1000;
  return wallToUtc(wall, resolveDisplayTz(tz));
}
