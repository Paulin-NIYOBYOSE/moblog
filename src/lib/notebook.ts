// Notebook — a simple personal notebook to stay organised: a monthly budget
// (income, spending, saving), savings — general savings, which gets whatever a
// month doesn't plan for, and the kill list, the things you save for one by
// one — and notes, day by day. Pure helpers shared by the page and the tests;
// days are local yyyy-mm-dd strings and months yyyy-mm, so no time zone can
// shift them.

import type { BudgetCategory, BudgetEntry, BudgetMonth, KillItem, NotebookData, NotebookNote } from "./types";

// ---------------------------------------------------------------------------
// Days and months
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function utcOf(day: string): number {
  return Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
}

function keyOfUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return keyOfUtc(utcOf(day) + n * DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: string): number {
  return new Date(utcOf(day)).getUTCDay();
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Whole months from `from` to `to` (0 = same month, negative = earlier). */
export function monthsBetween(from: string, to: string): number {
  return (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7));
}

export function daysInMonth(month: string): number {
  return new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
}

/** Monday → Sunday of the week holding `day`. */
export function weekOf(day: string): string[] {
  const monday = addDays(day, -((weekdayOf(day) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function monthTitle(month: string): string {
  return new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "October". */
export function monthName(month: string): string {
  return monthTitle(month).split(" ")[0];
}

export function dayTitle(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string {
  return new Date(utcOf(day)).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

/** "26 Oct – 1 Nov 2026": the week starting on `monday`. */
export function weekTitle(monday: string): string {
  const sunday = addDays(monday, 6);
  const from = dayTitle(monday, monday.slice(0, 4) === sunday.slice(0, 4) ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  return `${from} – ${dayTitle(sunday, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Days from `today` to the end of `month`, today included (0 for past months). */
export function daysLeftInMonth(month: string, today: string): number {
  const current = monthOf(today);
  if (month < current) return 0;
  if (month > current) return daysInMonth(month);
  return daysInMonth(month) - +today.slice(8, 10) + 1;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export const CURRENCY_OPTIONS = [
  "USD", "EUR", "GBP", "RWF", "KES", "UGX", "TZS", "BIF", "CDF", "NGN", "GHS", "ZAR",
  "XOF", "XAF", "EGP", "MAD", "AED", "INR", "CNY", "JPY", "CAD", "AUD", "CHF",
];

/** Money in the notebook's currency; whole units where the currency has no cents. */
export function formatMoney(value: number, currency: string | null, opts: { signed?: boolean } = {}): string {
  const sign = opts.signed && value > 0 ? "+" : "";
  const whole = Math.abs(value) >= 1000 ? 0 : undefined;
  try {
    return sign + new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: whole, maximumFractionDigits: whole }).format(value);
  } catch {
    return `${sign}${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency ?? ""}`.trim();
  }
}

export const STARTER_CATEGORIES: { name: string; emoji: string }[] = [
  { name: "General use", emoji: "🧾" },
  { name: "Rent & housing", emoji: "🏠" },
  { name: "Food & groceries", emoji: "🛒" },
  { name: "Transport", emoji: "🚕" },
  { name: "Utilities", emoji: "💡" },
  { name: "Phone & internet", emoji: "📶" },
  { name: "Family & giving", emoji: "🤝" },
  { name: "Health", emoji: "🩺" },
  { name: "Going out & fun", emoji: "🎉" },
];

/** A month's own spending categories, in order. */
export function monthCategories(categories: BudgetCategory[], month: string): BudgetCategory[] {
  return categories.filter((c) => c.month === month).sort((a, b) => a.position - b.position);
}

/** The category kill-list purchases go to by default, in that month's budget. */
export function killListCategory(categories: BudgetCategory[], month: string): BudgetCategory | null {
  return monthCategories(categories, month).find((c) => /kill/i.test(c.name)) ?? null;
}

/** The latest month before `month` that has a plan — the one "copy last month" copies. */
export function previousPlan(months: BudgetMonth[], month: string): BudgetMonth | null {
  return months.filter((m) => m.month < month).sort((a, b) => b.month.localeCompare(a.month))[0] ?? null;
}

// ---- Savings pots -----------------------------------------------------------

/** Where saved money sits: a kill-list item, or general savings. */
export type PotKey = `k:${string}` | "general";

export const killKey = (id: string): PotKey => `k:${id}`;

function potOfEntry(e: Pick<BudgetEntry, "killItemId">): PotKey {
  return e.killItemId ? killKey(e.killItemId) : "general";
}

/** How a money entry changes a pot's own entries: (pot, +/− amount), or null. */
export function savingsMove(e: BudgetEntry): { pot: PotKey; amount: number } | null {
  if (e.kind === "saving") return { pot: potOfEntry(e), amount: e.amount };
  if (e.kind === "withdrawal") return { pot: potOfEntry(e), amount: -e.amount };
  if (e.kind === "expense" && e.fromSavings) return { pot: potOfEntry(e), amount: -e.fromSavings };
  return null;
}

/** What each kill-list item holds (and money moved to general savings by hand, under "general"). */
export function savingsBalances(entries: BudgetEntry[]): Map<PotKey, number> {
  const out = new Map<PotKey, number>();
  for (const e of entries) {
    const m = savingsMove(e);
    if (m) out.set(m.pot, round2((out.get(m.pot) ?? 0) + m.amount));
  }
  return out;
}

/** Saved for kill-list items, all together. */
export function savedForItems(entries: BudgetEntry[]): number {
  let total = 0;
  for (const [pot, v] of savingsBalances(entries)) if (pot !== "general") total += Math.max(0, v);
  return round2(total);
}

/** Put aside in `month`, per pot (minus what was taken back out). */
export function savedInMonth(entries: BudgetEntry[], month: string): Map<PotKey, number> {
  const out = new Map<PotKey, number>();
  for (const e of entries) {
    if (monthOf(e.day) !== month || (e.kind !== "saving" && e.kind !== "withdrawal")) continue;
    const pot = potOfEntry(e);
    out.set(pot, round2((out.get(pot) ?? 0) + (e.kind === "saving" ? e.amount : -e.amount)));
  }
  return out;
}

/** Saving still needed each month (this one included) to reach `target` by `targetMonth`. */
export function monthlyNeeded(target: number | null, saved: number, targetMonth: string | null, today: string): number | null {
  if (target === null || !targetMonth) return null;
  const remaining = target - saved;
  if (remaining <= 0) return null;
  const months = monthsBetween(monthOf(today), targetMonth) + 1;
  return round2(remaining / Math.max(1, months));
}

// ---- A month ----------------------------------------------------------------

/** Stands in for the category of kill-list purchases recorded without one. */
export const KILL_PURCHASES: BudgetCategory = { id: "kill-list", month: "", name: "Kill list purchases", emoji: "🎯", planned: 0, position: 9999 };

export interface CategoryLine {
  /** null = expenses without a category; KILL_PURCHASES = kill-list purchases without one. */
  category: BudgetCategory | null;
  planned: number;
  spent: number;
  left: number;
}

export interface MonthSummary {
  expectedIncome: number;
  receivedIncome: number;
  plannedSpending: number;
  /** Spent from the month's money — what a kill-list item's savings paid doesn't count. */
  spent: number;
  /** Planned saving for kill-list items. */
  plannedSaving: number;
  /** Put aside for kill-list items this month, minus what was taken back out. */
  saved: number;
  /** Planned spending − spent (negative when overspent). */
  left: number;
  /** What the plan leaves for general savings: expected income − planned spending − planned saving. */
  planToGeneral: number;
  /**
   * What the month adds to general savings: income not planned for spending or
   * saving (less any overspending) while it runs, everything left once it's
   * over. null while no income is written down for it — nothing to go on.
   */
  toGeneral: number | null;
  /** The month is over. */
  closed: boolean;
  /** What can still be spent per day this month (null for past months or with no spending plan). */
  perDay: number | null;
  /** Every category of the month, then kill-list purchases and uncategorised spending (if any). */
  lines: CategoryLine[];
}

export interface MonthContext {
  categories: BudgetCategory[];
  killItems: KillItem[];
}

/** Planned saving of a month, per kill-list item. */
export function plannedSaving(plan: BudgetMonth | null, ctx: Pick<MonthContext, "killItems">): Map<PotKey, number> {
  const out = new Map<PotKey, number>();
  if (!plan) return out;
  for (const k of ctx.killItems) if (plan.plan[killKey(k.id)]) out.set(killKey(k.id), plan.plan[killKey(k.id)]);
  return out;
}

export function monthSummary(plan: BudgetMonth | null, entries: BudgetEntry[], ctx: MonthContext, month: string, today: string): MonthSummary {
  const categories = monthCategories(ctx.categories, month);
  const spentBy = new Map<string | null, number>();
  let spent = 0;
  let received = 0;
  let savedIn = 0; // into kill-list items
  let takenOut = 0; // out of kill-list items
  let moved = 0; // moved to general savings by hand
  for (const e of entries) {
    if (monthOf(e.day) !== month) continue;
    if (e.kind === "income") received += e.amount;
    else if (e.kind === "expense") {
      const own = e.amount - (e.fromSavings ?? 0);
      spent += own;
      const key = e.categoryId && categories.some((c) => c.id === e.categoryId) ? e.categoryId : e.killItemId ? KILL_PURCHASES.id : null;
      spentBy.set(key, (spentBy.get(key) ?? 0) + own);
    } else if (e.kind === "saving") {
      if (e.killItemId) savedIn += e.amount;
      else moved += e.amount;
    } else if (e.kind === "withdrawal") {
      if (e.killItemId) takenOut += e.amount;
      else moved -= e.amount;
    }
  }
  const lines: CategoryLine[] = [];
  let planned = 0;
  for (const c of categories) {
    const s = spentBy.get(c.id) ?? 0;
    planned += c.planned;
    lines.push({ category: c, planned: c.planned, spent: round2(s), left: round2(c.planned - s) });
  }
  const bought = spentBy.get(KILL_PURCHASES.id) ?? 0;
  if (bought > 0) lines.push({ category: KILL_PURCHASES, planned: 0, spent: round2(bought), left: round2(-bought) });
  const unfiled = spentBy.get(null) ?? 0;
  if (unfiled > 0) lines.push({ category: null, planned: 0, spent: round2(unfiled), left: round2(-unfiled) });
  let toSave = 0;
  for (const v of plannedSaving(plan, ctx).values()) toSave += v;
  const left = round2(planned - spent);
  const daysLeft = daysLeftInMonth(month, today);
  const closed = month < monthOf(today);
  // The month's money after spending and saving; while it runs, what's planned is kept back.
  const cash = received - spent - (savedIn - takenOut) - moved;
  const toGeneral =
    received <= 0 || month > monthOf(today)
      ? null
      : round2(closed ? cash : Math.max(0, received + takenOut - Math.max(spent, planned) - Math.max(savedIn, toSave) - moved) + Math.min(0, cash));
  return {
    expectedIncome: plan?.income ?? 0,
    receivedIncome: round2(received),
    plannedSpending: round2(planned),
    spent: round2(spent),
    plannedSaving: round2(toSave),
    saved: round2(savedIn - takenOut),
    left,
    planToGeneral: round2((plan?.income ?? 0) - planned - toSave),
    toGeneral,
    closed,
    perDay: daysLeft > 0 && planned > 0 ? round2(Math.max(0, left) / daysLeft) : null,
    lines,
  };
}

// ---- General savings and the months over time --------------------------------

type MoneyData = Pick<NotebookData, "settings" | "months" | "entries" | "categories" | "killItems">;

/** Every month from the first one with a plan or money up to this one. */
export function notebookMonths(data: Pick<NotebookData, "months" | "entries">, today: string): string[] {
  const current = monthOf(today);
  let first = current;
  for (const m of data.months) if (m.month < first) first = m.month;
  for (const e of data.entries) if (monthOf(e.day) < first) first = monthOf(e.day);
  const out: string[] = [];
  for (let m = first; m <= current; m = addMonths(m, 1)) out.push(m);
  return out;
}

export interface GeneralSavings {
  balance: number;
  /** Savings you already had when you started. */
  start: number;
  /** Moved here by hand (e.g. what was left on a kill-list item). */
  moved: number;
  /** What each month added (or took), newest first — months without income left out. */
  months: { month: string; amount: number; closed: boolean }[];
}

/** General savings: what you had, what you moved in, and every month's share (see MonthSummary.toGeneral). */
export function generalSavings(data: MoneyData, today: string): GeneralSavings {
  const start = data.settings.generalStart ?? 0;
  let moved = 0;
  for (const e of data.entries) {
    if (e.killItemId || e.day > today) continue;
    if (e.kind === "saving") moved += e.amount;
    else if (e.kind === "withdrawal") moved -= e.amount;
  }
  const months: GeneralSavings["months"] = [];
  let fromMonths = 0;
  for (const month of notebookMonths(data, today).reverse()) {
    const s = monthSummary(data.months.find((m) => m.month === month) ?? null, data.entries, data, month, today);
    if (s.toGeneral === null || s.toGeneral === 0) continue;
    months.push({ month, amount: s.toGeneral, closed: s.closed });
    fromMonths += s.toGeneral;
  }
  return { balance: round2(start + moved + fromMonths), start, moved: round2(moved), months };
}

/** Spending per category from `from` to `to` (months) — the same name adds up across months — biggest first. */
export function spendingByCategory(data: Pick<NotebookData, "entries" | "categories">, from: string, to: string): { name: string; spent: number }[] {
  const byName = new Map<string, { name: string; spent: number }>();
  for (const e of data.entries) {
    const month = monthOf(e.day);
    if (e.kind !== "expense" || month < from || month > to) continue;
    const c = data.categories.find((x) => x.id === e.categoryId);
    const name = c ? `${c.emoji ? `${c.emoji} ` : ""}${c.name}` : e.killItemId ? "🎯 Kill list purchases" : "Uncategorised";
    const key = c ? c.name.trim().toLowerCase() : name;
    const row = byName.get(key) ?? { name, spent: 0 };
    row.spent = round2(row.spent + e.amount - (e.fromSavings ?? 0));
    byName.set(key, row);
  }
  return [...byName.values()].filter((r) => r.spent > 0).sort((a, b) => b.spent - a.spent);
}

// ---------------------------------------------------------------------------
// Kill list
// ---------------------------------------------------------------------------

/** Still to buy, in priority order — the first is the one you're targeting. */
export function openKillItems(items: KillItem[]): KillItem[] {
  return items.filter((i) => !i.boughtOn).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

/** Bought ("killed"), most recent first. */
export function killedItems(items: KillItem[]): KillItem[] {
  return items.filter((i) => i.boughtOn).sort((a, b) => b.boughtOn!.localeCompare(a.boughtOn!) || b.createdAt.localeCompare(a.createdAt));
}

export function killSummary(items: KillItem[], entries: BudgetEntry[] = []) {
  const open = openKillItems(items);
  const killed = killedItems(items);
  const balances = savingsBalances(entries);
  return {
    open: open.length,
    openTotal: round2(open.reduce((s, i) => s + (i.price ?? 0), 0)),
    unpriced: open.filter((i) => i.price === null).length,
    saved: round2(open.reduce((s, i) => s + Math.max(0, balances.get(killKey(i.id)) ?? 0), 0)),
    killed: killed.length,
    killedTotal: round2(killed.reduce((s, i) => s + (i.paid ?? i.price ?? 0), 0)),
  };
}

/** Saved toward an item vs its price. */
export function killProgress(item: Pick<KillItem, "price">, saved: number) {
  const price = item.price;
  return {
    saved,
    left: price === null ? null : round2(Math.max(0, price - saved)),
    pct: price ? Math.min(100, (saved / price) * 100) : null,
    ready: price !== null && price > 0 && saved >= price,
  };
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** A day's notes, in the order they were written. */
export function notesOn(notes: NotebookNote[], day: string): NotebookNote[] {
  return notes.filter((n) => n.day === day).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
