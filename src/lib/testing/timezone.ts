// Resolves a trade's weekday/time-of-day in a chosen IANA timezone (for the
// Day/Time/Timezone filters) using the built-in Intl API — no dependency.

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ZonedDateInfo {
  weekday: number; // 0 = Sunday .. 6 = Saturday
  time: string; // "HH:mm", 24h
}

export function zonedDateInfo(dateIso: string, timeZone: string): ZonedDateInfo {
  const date = new Date(dateIso);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const weekday = WEEKDAY_ABBR.indexOf(map.weekday);
    return {
      weekday: weekday === -1 ? date.getDay() : weekday,
      time: `${map.hour ?? "00"}:${map.minute ?? "00"}`,
    };
  } catch {
    return {
      weekday: date.getDay(),
      time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    };
  }
}
