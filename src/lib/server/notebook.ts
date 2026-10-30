// Server side of the Notebook: validation and database access for the monthly
// budget (income, spending, saving), savings (general savings and the kill
// list) and notes.
// The API routes under /api/notebook are thin wrappers around these functions.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import type { BudgetCategory, BudgetEntry, BudgetKind, BudgetMonth, KillItem, NotebookData, NotebookNote, NotebookSettings } from "@/lib/types";
import { DAY_RE, toNumberOrNull, toTextOrNull } from "./parse";

export class NotebookError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "NotebookError";
  }
}

const NO_TABLES = "The notebook's tables aren't in the database yet. Run `npm run db:deploy` to apply the pending migration, then reload.";
const UNREACHABLE = "The database didn't respond in time — it may be waking up or the connection dropped. Try again in a few seconds.";

/** The JSON answer for an error a handler threw. */
export function errorResponse(label: string, e: unknown): Response {
  if (e instanceof NotebookError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") return NextResponse.json({ error: "Not found — it may have been deleted." }, { status: 404 });
    // P2021/P2022: a table or column is missing — the migration hasn't been applied to this database.
    if (e.code === "P2021" || e.code === "P2022") return NextResponse.json({ error: NO_TABLES, setup: true }, { status: 503 });
    // P1001: server unreachable; P2024: no free connection in time.
    if (e.code === "P1001" || e.code === "P2024") return NextResponse.json({ error: UNREACHABLE, retry: true }, { status: 503, headers: { "Retry-After": "3" } });
  }
  if (e instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: UNREACHABLE, retry: true }, { status: 503, headers: { "Retry-After": "3" } });
  console.error(`${label} failed:`, e);
  return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
}

/** Run a Notebook API handler: auth check + consistent JSON errors. */
export async function handle(label: string, fn: () => Promise<unknown>, status = 200): Promise<Response> {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await fn(), { status });
  } catch (e) {
    return errorResponse(label, e);
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Body = Record<string, unknown>;
type Tx = Prisma.TransactionClient;
const has = (b: Body, k: string) => Object.prototype.hasOwnProperty.call(b, k);

export function dayParam(value: unknown): string {
  const s = String(value ?? "");
  if (!DAY_RE.test(s) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new NotebookError("A valid day (yyyy-mm-dd) is required.");
  return s;
}

export function monthParam(value: unknown): string {
  const s = String(value ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new NotebookError("A valid month (yyyy-mm) is required.");
  return s;
}

function money(value: unknown, label: string, { required = false, positive = false } = {}): number | null {
  const n = toNumberOrNull(value);
  if (n === null) {
    if (required) throw new NotebookError(`${label} is required.`);
    return null;
  }
  if (n < 0 || (positive && n === 0) || n > 1e12) throw new NotebookError(`${label} must be ${positive ? "more than 0" : "0 or more"}.`);
  return Math.round(n * 100) / 100;
}

function name(value: unknown, label: string, max = 120): string {
  const s = toTextOrNull(value, max);
  if (!s) throw new NotebookError(`${label} is required.`);
  return s;
}

const emoji = (value: unknown) => toTextOrNull(value, 16);
const round2 = (x: number) => Math.round(x * 100) / 100;

function link(value: unknown): string | null {
  const s = toTextOrNull(value, 1000);
  if (!s) return null;
  // Only web links: the page renders it as an <a href>.
  if (!/^https?:\/\/[^\s]+$/i.test(s)) throw new NotebookError("The link must start with http:// or https://.");
  return s;
}

const ids = (value: unknown) => (Array.isArray(value) ? value.map(String).slice(0, 1000) : []);

// ---------------------------------------------------------------------------
// Read everything
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "settings";

function toKill(r: Prisma.KillItemGetPayload<object>): KillItem {
  return { id: r.id, name: r.name, price: r.price, position: r.position, targetMonth: r.targetMonth, link: r.link, notes: r.notes, boughtOn: r.boughtOn, paid: r.paid, createdAt: r.createdAt.toISOString() };
}

function toCategory(r: Prisma.BudgetCategoryGetPayload<object>): BudgetCategory {
  return { id: r.id, month: r.month, name: r.name, emoji: r.emoji, planned: r.planned, position: r.position };
}

const KINDS: BudgetKind[] = ["expense", "income", "saving", "withdrawal"];

function toEntry(r: Prisma.BudgetEntryGetPayload<object>): BudgetEntry {
  return {
    id: r.id,
    day: r.day,
    kind: (KINDS as string[]).includes(r.kind) ? (r.kind as BudgetKind) : "expense",
    amount: r.amount,
    categoryId: r.categoryId,
    note: r.note,
    killItemId: r.killItemId,
    fromSavings: r.fromSavings,
    createdAt: r.createdAt.toISOString(),
  };
}

function toMonth(r: Prisma.BudgetMonthGetPayload<object>): BudgetMonth {
  return { month: r.month, income: r.income, plan: (r.plan ?? {}) as Record<string, number> };
}

function toNote(r: Prisma.NotebookNoteGetPayload<object>): NotebookNote {
  return { id: r.id, day: r.day, text: r.text, done: r.done, createdAt: r.createdAt.toISOString() };
}

function toSettings(value: unknown): NotebookSettings {
  return { currency: null, generalGoal: null, generalStart: null, ...((value ?? {}) as Partial<NotebookSettings>) };
}

const byPosition = [{ position: "asc" as const }, { createdAt: "asc" as const }];

export async function loadNotebook(): Promise<NotebookData> {
  const [settings, killItems, categories, months, entries, notes] = await Promise.all([
    prisma.notebookMeta.findUnique({ where: { key: SETTINGS_KEY } }),
    prisma.killItem.findMany({ orderBy: byPosition }),
    prisma.budgetCategory.findMany({ orderBy: [{ month: "asc" }, ...byPosition] }),
    prisma.budgetMonth.findMany({ orderBy: { month: "desc" } }),
    prisma.budgetEntry.findMany({ orderBy: [{ day: "desc" }, { createdAt: "desc" }] }),
    prisma.notebookNote.findMany({ orderBy: [{ day: "asc" }, { createdAt: "asc" }] }),
  ]);
  return {
    settings: toSettings(settings?.value),
    killItems: killItems.map(toKill),
    categories: categories.map(toCategory),
    months: months.map(toMonth),
    entries: entries.map(toEntry),
    notes: notes.map(toNote),
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Change any of the settings: the currency, the general savings goal, the savings you started with. */
export async function saveSettings(body: Body): Promise<NotebookSettings> {
  const row = await prisma.notebookMeta.findUnique({ where: { key: SETTINGS_KEY } });
  const value = toSettings(row?.value);
  if (has(body, "currency")) {
    const currency = String(body.currency ?? "").toUpperCase();
    try {
      if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError();
      new Intl.NumberFormat("en-US", { style: "currency", currency });
    } catch {
      throw new NotebookError("Choose a valid currency code (e.g. USD).");
    }
    value.currency = currency;
  }
  if (has(body, "generalGoal")) value.generalGoal = money(body.generalGoal, "The goal") || null;
  if (has(body, "generalStart")) value.generalStart = money(body.generalStart, "The savings you already had") || null;
  const json = value as unknown as Prisma.InputJsonValue;
  await prisma.notebookMeta.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: json }, update: { value: json } });
  return value;
}

// ---------------------------------------------------------------------------
// Savings pots: a kill-list item, or general savings (no item)
// ---------------------------------------------------------------------------

interface Pot {
  killItemId: string | null;
}

function potWhere(pot: Pot): Prisma.BudgetEntryWhereInput {
  return { killItemId: pot.killItemId };
}

/** What a pot holds: saved − taken out − spent from it (optionally ignoring one entry). */
export async function potBalance(db: Tx | typeof prisma, pot: Pot, exceptId?: string): Promise<number> {
  const rows = await db.budgetEntry.findMany({ where: { ...potWhere(pot), ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { kind: true, amount: true, fromSavings: true } });
  let total = 0;
  for (const r of rows) {
    if (r.kind === "saving") total += r.amount;
    else if (r.kind === "withdrawal") total -= r.amount;
    else if (r.kind === "expense") total -= r.fromSavings ?? 0;
  }
  return round2(total);
}

async function potName(db: Tx | typeof prisma, pot: Pot): Promise<string> {
  if (pot.killItemId) return (await db.killItem.findUnique({ where: { id: pot.killItemId }, select: { name: true } }))?.name ?? "that item";
  return "general savings";
}

/** The pot an entry names; checks it exists. */
async function potOf(db: Tx | typeof prisma, body: Body): Promise<Pot> {
  const killItemId = body.killItemId ? String(body.killItemId) : null;
  if (killItemId && !(await db.killItem.findUnique({ where: { id: killItemId }, select: { id: true } }))) throw new NotebookError("That kill-list item no longer exists.");
  return { killItemId };
}

/** General savings change by themselves (see generalSavings in lib/notebook): nothing is taken out of them by hand. */
const GENERAL_OUT = "General savings change by themselves — to use them, write down the spending in the budget.";

async function ensureCovered(db: Tx | typeof prisma, pot: Pot, amount: number, exceptId?: string) {
  const balance = await potBalance(db, pot, exceptId);
  if (amount > balance + 1e-9) throw new NotebookError(`Only ${balance.toLocaleString("en-US")} is saved in ${await potName(db, pot)}.`);
}

// ---------------------------------------------------------------------------
// Kill list
// ---------------------------------------------------------------------------

function killData(body: Body, create: boolean): Prisma.KillItemUncheckedUpdateInput {
  const data: Prisma.KillItemUncheckedUpdateInput = {};
  if (create || has(body, "name")) data.name = name(body.name, "What to buy", 160);
  if (create || has(body, "price")) data.price = money(body.price, "The price");
  if (create || has(body, "targetMonth")) data.targetMonth = body.targetMonth ? monthParam(body.targetMonth) : null;
  if (create || has(body, "link")) data.link = link(body.link);
  if (create || has(body, "notes")) data.notes = toTextOrNull(body.notes, 2000);
  return data;
}

export async function createKillItem(body: Body): Promise<KillItem> {
  const last = await prisma.killItem.aggregate({ _max: { position: true }, where: { boughtOn: null } });
  const row = await prisma.killItem.create({ data: { ...(killData(body, true) as Prisma.KillItemUncheckedCreateInput), position: (last._max.position ?? -1) + 1 } });
  return toKill(row);
}

export async function updateKillItem(id: string, body: Body): Promise<KillItem> {
  return toKill(await prisma.killItem.update({ where: { id }, data: killData(body, false) }));
}

export async function deleteKillItem(id: string) {
  // Money saved toward it goes to general savings; a recorded purchase stays in the budget.
  await prisma.killItem.delete({ where: { id } });
  return { id };
}

/** New priority order of the items still to buy (first = the one you're targeting). */
export async function reorderKillItems(body: Body): Promise<{ ids: string[] }> {
  const list = ids(body.ids);
  if (!list.length) throw new NotebookError("Nothing to reorder.");
  await prisma.$transaction(list.map((id, position) => prisma.killItem.updateMany({ where: { id }, data: { position } })));
  return { ids: list };
}

/**
 * Kill an item: mark it bought and record what it cost as an expense of that
 * day. With `useSavings`, the money saved toward it pays first and only the
 * rest comes out of that month's money. Killing it again updates the same
 * purchase. One transaction, so the list and the money never disagree.
 */
export async function markBought(id: string, body: Body): Promise<{ item: KillItem; entry: BudgetEntry | null; removedEntryId: string | null }> {
  const day = dayParam(body.day);
  const paid = money(body.paid, "What it cost");
  const categoryId = body.categoryId ? String(body.categoryId) : null;
  return prisma.$transaction(async (tx) => {
    const item = await tx.killItem.update({ where: { id }, data: { boughtOn: day, paid } });
    const existing = await tx.budgetEntry.findFirst({ where: { killItemId: id, kind: "expense" } });
    const amount = paid ?? item.price;
    if (!amount) {
      if (existing) await tx.budgetEntry.delete({ where: { id: existing.id } });
      return { item: toKill(item), entry: null, removedEntryId: existing?.id ?? null };
    }
    await checkCategory(tx, categoryId, day);
    const saved = await potBalance(tx, { killItemId: id }, existing?.id);
    const fromSavings = body.useSavings === false ? null : Math.min(Math.max(0, saved), amount) || null;
    const data = { day, kind: "expense", amount, categoryId, note: item.name, fromSavings };
    const entry = existing ? await tx.budgetEntry.update({ where: { id: existing.id }, data }) : await tx.budgetEntry.create({ data: { ...data, killItemId: id } });
    return { item: toKill(item), entry: toEntry(entry), removedEntryId: null };
  });
}

/** Bring a killed item back to its place in the list; its purchase is removed (and its savings are back on it). */
export async function undoBought(id: string): Promise<{ item: KillItem; removedEntryId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.budgetEntry.findFirst({ where: { killItemId: id, kind: "expense" } });
    if (existing) await tx.budgetEntry.delete({ where: { id: existing.id } });
    const item = await tx.killItem.update({ where: { id }, data: { boughtOn: null, paid: null } });
    return { item: toKill(item), removedEntryId: existing?.id ?? null };
  });
}

// ---------------------------------------------------------------------------
// Budget: monthly plans (with their spending categories) and money entries
// ---------------------------------------------------------------------------

const objectOf = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Planned saving, keeping only kill-list items that are still to buy. */
async function savingPlan(db: Tx, raw: Record<string, unknown>): Promise<Record<string, number>> {
  const items = await db.killItem.findMany({ where: { boughtOn: null }, select: { id: true } });
  const known = new Set(items.map((k) => `k:${k.id}`));
  const plan: Record<string, number> = {};
  for (const [key, v] of Object.entries(raw)) {
    const amount = money(v, "A planned saving");
    if (known.has(key) && amount) plan[key] = amount;
  }
  return plan;
}

async function monthResult(db: Tx, row: Prisma.BudgetMonthGetPayload<object>) {
  const categories = await db.budgetCategory.findMany({ where: { month: row.month }, orderBy: byPosition });
  return { month: toMonth(row), categories: categories.map(toCategory) };
}

/**
 * Save one month's plan: expected income, its spending categories (added,
 * renamed, re-planned, or removed — this month only) and planned saving per
 * kill-list item. What's left goes to general savings.
 */
export async function saveMonth(monthValue: unknown, body: Body): Promise<{ month: BudgetMonth; categories: BudgetCategory[] }> {
  const month = monthParam(monthValue);
  const income = money(body.income, "Expected income") ?? 0;
  return prisma.$transaction(async (tx) => {
    if (Array.isArray(body.categories)) {
      const existing = await tx.budgetCategory.findMany({ where: { month }, select: { id: true } });
      const keep = new Set<string>();
      for (const [position, raw] of body.categories.slice(0, 100).entries()) {
        const r = objectOf(raw);
        const label = name(r.name, "Every category needs a name", 60);
        const data = { name: label, emoji: emoji(r.emoji), planned: money(r.planned, `The amount for ${label}`) ?? 0, position };
        const id = typeof r.id === "string" && existing.some((c) => c.id === r.id) ? r.id : null;
        keep.add(id ? (await tx.budgetCategory.update({ where: { id }, data })).id : (await tx.budgetCategory.create({ data: { ...data, month } })).id);
      }
      const gone = existing.filter((c) => !keep.has(c.id)).map((c) => c.id);
      if (gone.length) await tx.budgetCategory.deleteMany({ where: { id: { in: gone } } });
    }
    const plan = await savingPlan(tx, objectOf(body.saving));
    const row = await tx.budgetMonth.upsert({ where: { month }, create: { month, income, plan }, update: { income, plan } });
    return monthResult(tx, row);
  });
}

/** Start a month from another one's budget: its categories, amounts and saving plan — copies, free to change. */
export async function copyMonth(toValue: unknown, body: Body): Promise<{ month: BudgetMonth; categories: BudgetCategory[] }> {
  const to = monthParam(toValue);
  const from = monthParam(body.from);
  if (from === to) throw new NotebookError("Pick another month to copy from.");
  return prisma.$transaction(async (tx) => {
    const [src, srcCats, have] = await Promise.all([
      tx.budgetMonth.findUnique({ where: { month: from } }),
      tx.budgetCategory.findMany({ where: { month: from }, orderBy: byPosition }),
      tx.budgetCategory.findMany({ where: { month: to }, select: { name: true } }),
    ]);
    if (!src && !srcCats.length) throw new NotebookError("That month has no budget to copy.");
    for (const c of srcCats) {
      if (have.some((h) => h.name.toLowerCase() === c.name.toLowerCase())) continue;
      await tx.budgetCategory.create({ data: { month: to, name: c.name, emoji: c.emoji, planned: c.planned, position: c.position } });
    }
    const plan = await savingPlan(tx, objectOf(src?.plan));
    const income = src?.income ?? 0;
    const row = await tx.budgetMonth.upsert({ where: { month: to }, create: { month: to, income, plan }, update: { income, plan } });
    return monthResult(tx, row);
  });
}

/** A spending category must exist and belong to the entry's month. */
async function checkCategory(db: Tx | typeof prisma, categoryId: string | null, day: string) {
  if (!categoryId) return;
  const c = await db.budgetCategory.findUnique({ where: { id: categoryId }, select: { month: true } });
  if (!c) throw new NotebookError("That category no longer exists.");
  if (c.month !== day.slice(0, 7)) throw new NotebookError("That category is in another month's budget — pick one from this month.");
}

/**
 * A new money entry. Spending names a category of that month's budget; a
 * saving names its kill-list item (none = moved to general savings), and a
 * withdrawal takes money back out of an item — no more than is saved there.
 */
export async function createEntry(body: Body): Promise<BudgetEntry> {
  const kind: BudgetKind = (KINDS as string[]).includes(String(body.kind)) ? (body.kind as BudgetKind) : "expense";
  const day = dayParam(body.day);
  const amount = money(body.amount, "The amount", { required: true, positive: true })!;
  const note = toTextOrNull(body.note, 300);
  return prisma.$transaction(async (tx) => {
    const categoryId = kind === "expense" && body.categoryId ? String(body.categoryId) : null;
    await checkCategory(tx, categoryId, day);
    let pot: Pot = { killItemId: null };
    if (kind === "saving" || kind === "withdrawal") {
      pot = await potOf(tx, body);
      if (kind === "withdrawal") {
        if (!pot.killItemId) throw new NotebookError(GENERAL_OUT);
        await ensureCovered(tx, pot, amount);
      }
    }
    const row = await tx.budgetEntry.create({ data: { day, kind, amount, note, categoryId, killItemId: pot.killItemId } });
    return toEntry(row);
  });
}

/** Edit an entry's day, amount, note and category (and switch between income and spending). */
export async function updateEntry(id: string, body: Body): Promise<BudgetEntry> {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.budgetEntry.findUnique({ where: { id } });
    if (!cur) throw new NotebookError("Not found — it may have been deleted.", 404);
    const data: Prisma.BudgetEntryUncheckedUpdateInput = {};
    let kind = cur.kind as BudgetKind;
    if (has(body, "kind") && body.kind !== cur.kind) {
      const next = body.kind === "income" ? "income" : body.kind === "expense" ? "expense" : null;
      if (!next || (cur.kind !== "income" && cur.kind !== "expense") || cur.fromSavings || cur.killItemId) throw new NotebookError("This entry can't change kind — delete it and add a new one.");
      kind = next;
      data.kind = next;
      data.categoryId = null;
    }
    if (has(body, "day")) {
      data.day = dayParam(body.day);
      // Moved to another month: its category was this month's, so it goes (unless a new one is given below).
      if (data.day.slice(0, 7) !== cur.day.slice(0, 7)) data.categoryId = null;
    }
    if (has(body, "note")) data.note = toTextOrNull(body.note, 300);
    if (has(body, "amount")) {
      const amount = money(body.amount, "The amount", { required: true, positive: true })!;
      if (cur.fromSavings && amount < cur.fromSavings) throw new NotebookError("The amount can't be less than the part paid from savings.");
      data.amount = amount;
      if (kind === "withdrawal" && cur.killItemId) await ensureCovered(tx, { killItemId: cur.killItemId }, amount, id);
    }
    if (has(body, "categoryId") && kind === "expense") {
      const categoryId = body.categoryId ? String(body.categoryId) : null;
      await checkCategory(tx, categoryId, (data.day as string | undefined) ?? cur.day);
      data.categoryId = categoryId;
    }
    if (kind === "saving" && cur.killItemId && has(body, "amount")) {
      // Lowering a saving can't leave its item below what's already been taken out of it.
      const others = await potBalance(tx, { killItemId: cur.killItemId }, id);
      if (others + (data.amount as number) < -1e-9) throw new NotebookError(`That's less than what's already been used from ${await potName(tx, { killItemId: cur.killItemId })}.`);
    }
    return toEntry(await tx.budgetEntry.update({ where: { id }, data }));
  });
}

export async function deleteEntry(id: string) {
  await prisma.$transaction(async (tx) => {
    const cur = await tx.budgetEntry.findUnique({ where: { id } });
    if (!cur) throw new NotebookError("Not found — it may have been deleted.", 404);
    if (cur.kind === "expense" && cur.killItemId) throw new NotebookError("This records a kill-list purchase — use Undo on the kill list instead.");
    if (cur.kind === "saving" && cur.killItemId) {
      const pot = { killItemId: cur.killItemId };
      if ((await potBalance(tx, pot, id)) < -1e-9) throw new NotebookError(`Money from this saving has already been used from ${await potName(tx, pot)}.`);
    }
    await tx.budgetEntry.delete({ where: { id } });
  });
  return { id };
}

/** Move money saved for a kill-list item to general savings (or another item): a withdrawal and a saving, same day. */
export async function moveSavings(body: Body): Promise<{ entries: BudgetEntry[] }> {
  const day = dayParam(body.day);
  const amount = money(body.amount, "The amount", { required: true, positive: true })!;
  return prisma.$transaction(async (tx) => {
    const from = await potOf(tx, (body.from ?? {}) as Body);
    const to = await potOf(tx, (body.to ?? {}) as Body);
    if (!from.killItemId) throw new NotebookError(GENERAL_OUT);
    if (from.killItemId === to.killItemId) throw new NotebookError("Pick two different places.");
    await ensureCovered(tx, from, amount);
    const note = `Moved from ${await potName(tx, from)} to ${await potName(tx, to)}`;
    const out = await tx.budgetEntry.create({ data: { day, kind: "withdrawal", amount, note, killItemId: from.killItemId } });
    const into = await tx.budgetEntry.create({ data: { day, kind: "saving", amount, note, killItemId: to.killItemId } });
    return { entries: [toEntry(out), toEntry(into)] };
  });
}

// ---------------------------------------------------------------------------
// Notes: a planner, day by day
// ---------------------------------------------------------------------------

const noteText = (value: unknown) => name(value, "A note", 4000);

export async function createNote(body: Body): Promise<NotebookNote> {
  return toNote(await prisma.notebookNote.create({ data: { day: dayParam(body.day), text: noteText(body.text) } }));
}

/** Change a note's text, tick it done (or not), or move it to another day. */
export async function updateNote(id: string, body: Body): Promise<NotebookNote> {
  const data: Prisma.NotebookNoteUpdateInput = {};
  if (has(body, "text")) data.text = noteText(body.text);
  if (has(body, "done")) data.done = body.done === true;
  if (has(body, "day")) data.day = dayParam(body.day);
  return toNote(await prisma.notebookNote.update({ where: { id }, data }));
}

export async function deleteNote(id: string) {
  await prisma.notebookNote.delete({ where: { id } });
  return { id };
}
