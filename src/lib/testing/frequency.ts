// "Average trade frequency" — the three bar charts (Trades/day, Trades/week,
// Trades/month) from the Testing > Analytics > Performance screenshot. Each
// bucket is a raw trade count; only buckets that actually contain trades are
// shown, and the "Avg" badge is the mean of the shown bucket counts.

import { WEEKDAYS } from "@/lib/utils";
import { effectiveDate, isClosed } from "./stats";
import type { BacktestTrade } from "./types";

export interface FrequencyBucket {
  key: string;
  label: string;
  count: number;
}

export interface FrequencySeries {
  buckets: FrequencyBucket[];
  avg: number;
}

function toSeries(map: Map<string, FrequencyBucket>, order?: string[]): FrequencySeries {
  const keys = order ? order.filter((k) => map.has(k)) : Array.from(map.keys()).sort();
  const buckets = keys.map((k) => map.get(k)!);
  const avg = buckets.length ? buckets.reduce((s, b) => s + b.count, 0) / buckets.length : 0;
  return { buckets, avg };
}

function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift Sunday(0) back to the prior Monday
  d.setDate(d.getDate() + diff);
  return d;
}

export interface TradeFrequency {
  byWeekday: FrequencySeries;
  byWeek: FrequencySeries;
  byMonth: FrequencySeries;
}

const WEEKDAY_ORDER = ["1", "2", "3", "4", "5", "6", "0"]; // Mon..Sun
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function computeTradeFrequency(trades: BacktestTrade[]): TradeFrequency {
  const closed = trades.filter(isClosed);

  const weekdayMap = new Map<string, FrequencyBucket>();
  const weekMap = new Map<string, FrequencyBucket>();
  const monthMap = new Map<string, FrequencyBucket>();

  for (const t of closed) {
    const d = new Date(effectiveDate(t));

    const wd = String(d.getDay());
    const wdEntry = weekdayMap.get(wd) ?? { key: wd, label: WEEKDAYS[Number(wd)], count: 0 };
    wdEntry.count += 1;
    weekdayMap.set(wd, wdEntry);

    const weekStart = mondayOf(d);
    const weekKey = weekStart.toISOString().slice(0, 10);
    const weekEntry = weekMap.get(weekKey) ?? {
      key: weekKey,
      label: String(weekStart.getDate()),
      count: 0,
    };
    weekEntry.count += 1;
    weekMap.set(weekKey, weekEntry);

    const monthKey = String(d.getMonth());
    const monthEntry = monthMap.get(monthKey) ?? {
      key: monthKey,
      label: MONTH_ABBR[d.getMonth()],
      count: 0,
    };
    monthEntry.count += 1;
    monthMap.set(monthKey, monthEntry);
  }

  return {
    byWeekday: toSeries(weekdayMap, WEEKDAY_ORDER),
    byWeek: toSeries(weekMap),
    byMonth: toSeries(monthMap, Array.from({ length: 12 }, (_, i) => String(i))),
  };
}
