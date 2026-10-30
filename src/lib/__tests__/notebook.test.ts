import { beforeEach, describe, expect, inject, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  addMonths,
  daysInMonth,
  daysLeftInMonth,
  formatMoney,
  generalSavings,
  killedItems,
  killProgress,
  killSummary,
  monthCategories,
  monthlyNeeded,
  monthsBetween,
  monthSummary,
  notesOn,
  openKillItems,
  savedForItems,
  savedInMonth,
  savingsBalances,
  spendingByCategory,
  weekOf,
  weekTitle,
} from "../notebook";
import { MONTH_SAYINGS, sayingOfMonth } from "../sayings";
import {
  copyMonth,
  createEntry,
  createKillItem,
  createNote,
  deleteEntry,
  deleteKillItem,
  deleteNote,
  errorResponse,
  loadNotebook,
  markBought,
  moveSavings,
  NotebookError,
  potBalance,
  saveMonth,
  saveSettings,
  undoBought,
  updateEntry,
  updateKillItem,
  updateNote,
} from "../server/notebook";
import type { BudgetCategory, BudgetEntry, BudgetMonth, KillItem, NotebookNote } from "../types";

const hasDb = Boolean(inject("testDbUrl"));

const range = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
let seq = 0;
const entry = (over: Partial<BudgetEntry>): BudgetEntry => ({ id: `e${++seq}`, day: "2026-10-10", kind: "expense", amount: 0, categoryId: null, note: null, killItemId: null, fromSavings: null, createdAt: "2026-10-10T10:00:00Z", ...over });
const cat = (id: string, planned = 0, month = "2026-10", position = 0): BudgetCategory => ({ id, month, name: id, emoji: null, planned, position });
const settings = { currency: "RWF", generalGoal: null, generalStart: null };
const item = (over: Partial<KillItem>): KillItem => ({ id: over.name ?? "x", name: "x", price: null, position: 0, targetMonth: null, link: null, notes: null, boughtOn: null, paid: null, createdAt: "2026-10-01T00:00:00Z", ...over });
const note = (over: Partial<NotebookNote>): NotebookNote => ({ id: `n${++seq}`, day: "2026-10-29", text: "x", done: false, createdAt: "2026-10-29T08:00:00Z", ...over });

describe("notebook dates", () => {
  it("adds days and months across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(monthsBetween("2026-10", "2027-03")).toBe(5);
    expect(daysInMonth("2028-02")).toBe(29);
  });

  it("starts weeks on Monday, names them, and counts the days left in a month", () => {
    expect(weekOf("2026-10-29")).toEqual(range("2026-10-26", "2026-11-01"));
    expect(weekTitle("2026-10-26")).toBe("26 Oct – 1 Nov 2026");
    expect(weekTitle("2026-12-28")).toBe("28 Dec 2026 – 3 Jan 2027");
    expect(daysLeftInMonth("2026-10", "2026-10-29")).toBe(3);
    expect(daysLeftInMonth("2026-09", "2026-10-29")).toBe(0);
  });
});

describe("money", () => {
  const food = cat("food", 300);
  const rent = cat("rent", 500, "2026-10", 1);
  const clothes = cat("clothes", 0, "2026-10", 2); // a line with nothing planned yet
  // Another month's own category: never part of October's sums.
  const novFood = cat("nov-food", 999, "2026-11");
  const ctx = { categories: [food, rent, clothes, novFood], killItems: [item({ name: "Laptop", price: 900 })] };
  const plan: BudgetMonth = { month: "2026-10", income: 1000, plan: { "k:Laptop": 50, "k:gone": 999 } };
  const october = [
    entry({ kind: "income", amount: 900, note: "Salary" }),
    entry({ kind: "income", amount: 40 }),
    entry({ categoryId: "food", amount: 120 }),
    entry({ categoryId: "rent", amount: 500 }),
    entry({ amount: 30 }), // uncategorised
    entry({ amount: 50, fromSavings: 20, killItemId: "Laptop" }), // a kill-list buy: 20 from its savings, 30 from the month
    entry({ kind: "saving", killItemId: "Laptop", amount: 60 }),
    entry({ kind: "withdrawal", killItemId: "Laptop", amount: 10 }), // taken out of the laptop…
    entry({ kind: "saving", amount: 10 }), // …to general savings
    entry({ day: "2026-09-30", categoryId: "food", amount: 999 }), // another month
    entry({ day: "2026-11-02", categoryId: "nov-food", amount: 999 }), // November's own budget
  ];

  it("adds up a month: income, spending (not what savings paid), the kill list, and what goes to general savings", () => {
    const s = monthSummary(plan, october, ctx, "2026-10", "2026-10-29");
    expect(s).toMatchObject({ expectedIncome: 1000, receivedIncome: 940, plannedSpending: 800, spent: 680, plannedSaving: 50, saved: 50, left: 120, planToGeneral: 150, closed: false });
    // While October runs, its plan is kept back: 940 in − 800 planned spending − 60 saved for the laptop = 80
    // (the 10 moved from the laptop to general savings is already there).
    expect(s.toGeneral).toBe(80);
    expect(s.perDay).toBeCloseTo(120 / 3, 2);
    // Every line of the plan, even one with nothing planned, then kill-list buys and uncategorised spending.
    expect(s.lines.map((l) => [l.category?.id ?? null, l.planned, l.spent, l.left])).toEqual([
      ["food", 300, 120, 180],
      ["rent", 500, 500, 0],
      ["clothes", 0, 0, 0],
      ["kill-list", 0, 30, -30],
      [null, 0, 30, -30],
    ]);
    // Once it's over, everything left goes: the 80 and the 120 not spent.
    expect(monthSummary(plan, october, ctx, "2026-10", "2026-11-05")).toMatchObject({ closed: true, toGeneral: 200 });
    // Spending past the plan comes out of what's unplanned; past the income, out of general savings.
    const splurge = [...october, entry({ amount: 200 })];
    expect(monthSummary(plan, splurge, ctx, "2026-10", "2026-10-29").toGeneral).toBe(0);
    expect(monthSummary(plan, [...splurge, entry({ amount: 300 })], ctx, "2026-10", "2026-10-29").toGeneral).toBe(-300);
    // No income written down: nothing to go on.
    expect(monthSummary(null, october, ctx, "2026-09", "2026-10-29").toGeneral).toBeNull();
    expect(Object.fromEntries(savedInMonth(october, "2026-10"))).toEqual({ "k:Laptop": 50, general: 10 });
  });

  it("keeps general savings: what you had, what you moved in, and every month's share", () => {
    const entries = [...october, entry({ day: "2026-09-25", kind: "income", amount: 500 }), entry({ day: "2026-09-26", amount: 300 })];
    const data = { settings: { ...settings, generalStart: 1000 }, months: [plan], entries, categories: ctx.categories, killItems: ctx.killItems };
    const g = generalSavings(data, "2026-10-29");
    // September: 500 in − 300 − the 999 food = −799 (spent more than came in); October so far: 80.
    expect(g.months).toEqual([
      { month: "2026-10", amount: 80, closed: false },
      { month: "2026-09", amount: -799, closed: true },
    ]);
    expect(g).toMatchObject({ start: 1000, moved: 10, balance: 1000 + 10 + 80 - 799 });
  });

  it("keeps the kill list's savings item by item", () => {
    expect(Object.fromEntries(savingsBalances(october))).toEqual({ "k:Laptop": 30, general: 10 }); // 60 − 10 out − 20 paid
    expect(savedForItems(october)).toBe(30);
  });

  it("adds up spending by category name across months", () => {
    const data = { categories: [food, cat("nov-food", 0, "2026-11")].map((c, i) => ({ ...c, name: i ? "Food" : "food" })), entries: [...october] };
    expect(spendingByCategory(data, "2026-09", "2026-11")).toEqual([
      { name: "food", spent: 2118 }, // 120, 999 in September and 999 in November's "Food"
      { name: "Uncategorised", spent: 530 }, // 30, and rent — not one of this data's categories
      { name: "🎯 Kill list purchases", spent: 30 },
    ]);
  });

  it("works out the monthly saving needed to hit a date", () => {
    expect(monthlyNeeded(900, 300, "2027-01", "2026-10-29")).toBe(150); // Oct, Nov, Dec, Jan
    expect(monthlyNeeded(900, 300, "2026-09", "2026-10-29")).toBe(600); // late: all of it now
    expect(monthlyNeeded(900, 950, "2027-01", "2026-10-29")).toBeNull(); // already there
    expect(monthlyNeeded(null, 0, "2027-01", "2026-10-29")).toBeNull();
  });

  it("formats money in the notebook's currency", () => {
    expect(formatMoney(1250.5, "USD")).toBe("$1,251");
    expect(formatMoney(12.5, "USD")).toBe("$12.50");
    expect(formatMoney(15000, "RWF").replace(/\s/g, " ")).toBe("RWF 15,000"); // Intl uses a no-break space
    expect(formatMoney(5, "NOPE")).toBe("5 NOPE");
  });
});

describe("kill list", () => {
  const items = [item({ name: "Phone", price: 300, position: 1 }), item({ name: "Laptop", price: 900, position: 0 }), item({ name: "Course", position: 2 }), item({ name: "Shoes", price: 80, boughtOn: "2026-10-03", paid: 70 })];

  it("orders by priority, totals the list and what's saved for it", () => {
    expect(openKillItems(items).map((i) => i.name)).toEqual(["Laptop", "Phone", "Course"]);
    expect(killedItems(items).map((i) => i.name)).toEqual(["Shoes"]);
    const saved = [entry({ kind: "saving", killItemId: "Laptop", amount: 450 }), entry({ kind: "saving", killItemId: "Shoes", amount: 10 })];
    expect(killSummary(items, saved)).toEqual({ open: 3, openTotal: 1200, unpriced: 1, saved: 450, killed: 1, killedTotal: 70 });
  });

  it("shows how far an item is", () => {
    expect(killProgress({ price: 900 }, 450)).toEqual({ saved: 450, left: 450, pct: 50, ready: false });
    expect(killProgress({ price: 900 }, 900).ready).toBe(true);
    expect(killProgress({ price: null }, 100)).toEqual({ saved: 100, left: null, pct: null, ready: false });
  });
});

describe("notes and sayings", () => {
  it("lists a day's notes in the order they were written", () => {
    const notes = [note({ text: "Call the landlord", createdAt: "2026-10-29T09:00:00Z" }), note({ text: "Tomorrow", day: "2026-10-30" }), note({ text: "Pay rent", createdAt: "2026-10-29T07:00:00Z" })];
    expect(notesOn(notes, "2026-10-29").map((n) => n.text)).toEqual(["Pay rent", "Call the landlord"]);
    expect(notesOn(notes, "2026-10-31")).toEqual([]);
  });

  it("gives every month a saying, with the meaning of the ones not in English", () => {
    expect(MONTH_SAYINGS).toHaveLength(12);
    expect(new Set(MONTH_SAYINGS.map((s) => s.text)).size).toBe(12);
    expect(sayingOfMonth("2026-01")).toBe(MONTH_SAYINGS[0]);
    expect(sayingOfMonth("2026-12").author).toBe("Kinyarwanda proverb");
    for (const s of MONTH_SAYINGS) if (/Swahili|Kinyarwanda/.test(s.author)) expect(s.meaning).toBeTruthy();
  });
});

describe("notebook API errors", () => {
  it("explains a migration that hasn't been applied instead of failing with a server error", async () => {
    const missing = new Prisma.PrismaClientKnownRequestError("The table `public.KillItem` does not exist in the current database.", { code: "P2021", clientVersion: "6.19.3" });
    const res = errorResponse("GET /api/notebook", missing);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/npm run db:deploy/);
  });

  it("asks to try again when the database can't be reached", async () => {
    const res = errorResponse("GET /api/notebook", new Prisma.PrismaClientInitializationError("Can't reach database server", "6.19.3"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3");
    expect((await res.json()).error).toMatch(/didn't respond/);
    expect(errorResponse("x", new Prisma.PrismaClientKnownRequestError("timeout", { code: "P2024", clientVersion: "6.19.3" })).status).toBe(503);
  });

  it("answers 404 for a deleted record and 400 for bad input", async () => {
    expect(errorResponse("x", new Prisma.PrismaClientKnownRequestError("gone", { code: "P2025", clientVersion: "6.19.3" })).status).toBe(404);
    const bad = errorResponse("x", new NotebookError("A name is required."));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "A name is required." });
  });
});

describe.skipIf(!hasDb)("notebook server", () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "NotebookNote", "BudgetEntry", "KillItem", "BudgetCategory", "BudgetMonth", "NotebookMeta" CASCADE`);
  });

  const day = "2026-10-12";

  it("pays for a kill-list item with what was saved for it first, and undo puts the savings back", async () => {
    const { categories } = await saveMonth("2026-10", { income: 0, categories: [{ name: "Kill list" }], saving: {} });
    const killCat = categories[0];
    const laptop = await createKillItem({ name: "Laptop", price: 900 });
    await createEntry({ day: "2026-09-20", kind: "saving", amount: 600, killItemId: laptop.id });
    await expect(createEntry({ day, kind: "withdrawal", amount: 700, killItemId: laptop.id })).rejects.toThrow(/Only 600 is saved in Laptop/);

    const a = await markBought(laptop.id, { day, paid: 850, categoryId: killCat.id });
    expect(a.entry).toMatchObject({ kind: "expense", amount: 850, fromSavings: 600, killItemId: laptop.id, categoryId: killCat.id });
    expect(await potBalance(prisma, { killItemId: laptop.id })).toBe(0);
    const nb = await loadNotebook();
    expect(monthSummary(null, nb.entries, nb, "2026-10", "2026-10-29").spent).toBe(250); // only what the savings didn't cover

    // Killing it again (another price) updates the same purchase.
    const b = await markBought(laptop.id, { day, paid: 500 });
    expect(b.entry).toMatchObject({ id: a.entry!.id, amount: 500, fromSavings: 500 });
    expect(await potBalance(prisma, { killItemId: laptop.id })).toBe(100); // left over on the item

    await expect(deleteEntry(a.entry!.id)).rejects.toThrow(/Undo on the kill list/);
    const undone = await undoBought(laptop.id);
    expect(undone.item).toMatchObject({ boughtOn: null, paid: null, position: 0 });
    expect(await potBalance(prisma, { killItemId: laptop.id })).toBe(600);
  });

  it("can pay full price from this month's money instead", async () => {
    const phone = await createKillItem({ name: "Phone", price: 300 });
    await createEntry({ day, kind: "saving", amount: 100, killItemId: phone.id });
    const r = await markBought(phone.id, { day, paid: 300, useSavings: false });
    expect(r.entry).toMatchObject({ amount: 300, fromSavings: null });
    expect(await potBalance(prisma, { killItemId: phone.id })).toBe(100);
  });

  it("moves what's on an item to general savings — never the other way by hand", async () => {
    const shoes = await createKillItem({ name: "Shoes", price: 80 });
    await createEntry({ day, kind: "saving", amount: 50, killItemId: shoes.id });
    await moveSavings({ day, amount: 20, from: { killItemId: shoes.id }, to: {} });
    expect(await potBalance(prisma, { killItemId: shoes.id })).toBe(30);
    await expect(moveSavings({ day, amount: 999, from: { killItemId: shoes.id }, to: {} })).rejects.toThrow(/Only 30 is saved in Shoes/);
    await expect(moveSavings({ day, amount: 5, from: {}, to: { killItemId: shoes.id } })).rejects.toThrow(/General savings change by themselves/);
    await expect(createEntry({ day, kind: "withdrawal", amount: 5 })).rejects.toThrow(/General savings change by themselves/);

    // A removed item's savings go to general savings too.
    await deleteKillItem(shoes.id);
    const nb = await loadNotebook();
    expect(Object.fromEntries(savingsBalances(nb.entries))).toEqual({ general: 50 });
    expect(generalSavings(nb, "2026-10-29")).toMatchObject({ moved: 50, balance: 50 });
  });

  it("refuses to delete or shrink a saving that's already been spent from", async () => {
    const bag = await createKillItem({ name: "Bag", price: 150 });
    const saving = await createEntry({ day, kind: "saving", amount: 200, killItemId: bag.id });
    await markBought(bag.id, { day, paid: 150 });
    await expect(deleteEntry(saving.id)).rejects.toThrow(/already been used/);
    await expect(updateEntry(saving.id, { amount: 100 })).rejects.toThrow(/already been used/);
    expect(await updateEntry(saving.id, { amount: 160, note: "Bonus" })).toMatchObject({ amount: 160, note: "Bonus" });
    // Everyday spending never comes out of savings.
    expect(await createEntry({ day, kind: "expense", amount: 20, fromSavings: 20, killItemId: bag.id })).toMatchObject({ fromSavings: null, killItemId: null });
  });

  it("keeps income without a category, and spending in its own month's categories", async () => {
    const { categories } = await saveMonth("2026-10", { income: 500, categories: [{ name: "Food", planned: 100 }], saving: {} });
    const food = categories[0];
    expect(await createEntry({ day, kind: "income", amount: 500, categoryId: food.id, note: "Salary" })).toMatchObject({ kind: "income", categoryId: null, note: "Salary" });
    const lunch = await createEntry({ day, kind: "expense", amount: 5, categoryId: food.id });
    expect(lunch.categoryId).toBe(food.id);
    // Turned into income, it leaves its category.
    expect(await updateEntry(lunch.id, { kind: "income" })).toMatchObject({ kind: "income", categoryId: null });
  });

  it("saves a month's plan: its own categories, and saving for items still to buy", async () => {
    const laptop = await createKillItem({ name: "Laptop" });
    const r = await saveMonth("2026-10", {
      income: "1500",
      categories: [
        { name: "Food", emoji: "🛒", planned: "300.456" },
        { name: "Rent", planned: 500 },
      ],
      saving: { [`k:${laptop.id}`]: 100, general: 40, "k:nope": 5, unknown: 50 },
    });
    expect(r.month).toEqual({ month: "2026-10", income: 1500, plan: { [`k:${laptop.id}`]: 100 } }); // general savings gets what's left
    expect(monthCategories(r.categories, "2026-10").map((c) => [c.emoji, c.name, c.planned])).toEqual([
      ["🛒", "Food", 300.46],
      [null, "Rent", 500],
    ]);
    await expect(saveMonth("2026-13", { income: 1 })).rejects.toThrow(NotebookError);
    await expect(saveMonth("2026-10", { income: 1, categories: [{ name: "  " }] })).rejects.toThrow(/name/);
  });

  it("keeps every month's budget its own: changing November never touches October", async () => {
    // October: Food and Transport, and spending in them.
    const oct = await saveMonth("2026-10", { income: 1000, categories: [{ name: "Food", planned: 300 }, { name: "Transport", planned: 100 }], saving: {} });
    const octFood = oct.categories.find((c) => c.name === "Food")!;
    const lunch = await createEntry({ day: "2026-10-20", kind: "expense", amount: 12, categoryId: octFood.id });

    // November starts as a copy, then changes freely.
    const nov = await copyMonth("2026-11", { from: "2026-10" });
    expect(nov.month).toMatchObject({ month: "2026-11", income: 1000 });
    expect(monthCategories(nov.categories, "2026-11").map((c) => [c.name, c.planned])).toEqual([
      ["Food", 300],
      ["Transport", 100],
    ]);
    const novFood = nov.categories.find((c) => c.name === "Food")!;
    expect(novFood.id).not.toBe(octFood.id);
    const taxi = await createEntry({ day: "2026-11-03", kind: "expense", amount: 8, categoryId: nov.categories.find((c) => c.name === "Transport")!.id });
    // Rename Food, drop Transport, add Rent — in November only.
    await saveMonth("2026-11", { income: 1200, categories: [{ id: novFood.id, name: "Groceries", planned: 250 }, { name: "Rent", planned: 400 }], saving: {} });

    const nb = await loadNotebook();
    const byMonth = (m: string) => monthCategories(nb.categories, m).map((c) => `${c.name} ${c.planned}`);
    expect(byMonth("2026-10")).toEqual(["Food 300", "Transport 100"]);
    expect(byMonth("2026-11")).toEqual(["Groceries 250", "Rent 400"]);
    expect(nb.months.find((m) => m.month === "2026-10")!.income).toBe(1000);
    expect(nb.entries.find((e) => e.id === lunch.id)!.categoryId).toBe(octFood.id); // October's spending keeps its category
    expect(nb.entries.find((e) => e.id === taxi.id)!.categoryId).toBeNull(); // only November's own entries lose theirs
    expect(monthSummary(nb.months.find((m) => m.month === "2026-10")!, nb.entries, nb, "2026-10", "2026-11-05")).toMatchObject({ plannedSpending: 400, spent: 12 });
  });

  it("only lets an entry use its own month's categories", async () => {
    const oct = await saveMonth("2026-10", { income: 0, categories: [{ name: "Food", planned: 10 }], saving: {} });
    const octFood = oct.categories[0];
    await expect(createEntry({ day: "2026-11-02", kind: "expense", amount: 5, categoryId: octFood.id })).rejects.toThrow(/another month/);
    const e = await createEntry({ day: "2026-10-30", kind: "expense", amount: 5, categoryId: octFood.id });
    // Moving it to November drops October's category; giving November's one is fine.
    expect(await updateEntry(e.id, { day: "2026-11-01" })).toMatchObject({ day: "2026-11-01", categoryId: null });
    const nov = await copyMonth("2026-11", { from: "2026-10" });
    expect(await updateEntry(e.id, { categoryId: nov.categories[0].id })).toMatchObject({ categoryId: nov.categories[0].id });
    const shoes = await createKillItem({ name: "Shoes", price: 50 });
    await expect(markBought(shoes.id, { day: "2026-12-01", paid: 50, categoryId: octFood.id })).rejects.toThrow(/another month/);
    await expect(copyMonth("2027-01", { from: "2026-05" })).rejects.toThrow(/no budget to copy/);
  });

  it("writes notes on a day, ticks them, moves and deletes them", async () => {
    const rent = await createNote({ day: "2026-10-29", text: "  Pay rent  " });
    expect(rent).toMatchObject({ day: "2026-10-29", text: "Pay rent", done: false });
    const call = await createNote({ day: "2026-10-29", text: "Call the landlord\nabout the leak" });
    await expect(createNote({ day: "2026-10-29", text: "   " })).rejects.toThrow(/A note is required/);
    await expect(createNote({ day: "2026-02-30", text: "x" })).rejects.toThrow(/valid day/);

    expect(await updateNote(rent.id, { done: true })).toMatchObject({ done: true, text: "Pay rent" });
    expect(await updateNote(call.id, { day: "2026-10-30", text: "Call the landlord" })).toMatchObject({ day: "2026-10-30", text: "Call the landlord", done: false });
    await expect(updateNote(call.id, { text: "" })).rejects.toThrow(/A note is required/);

    let nb = await loadNotebook();
    expect(nb.notes.map((n) => [n.day, n.text, n.done])).toEqual([
      ["2026-10-29", "Pay rent", true],
      ["2026-10-30", "Call the landlord", false],
    ]);
    await deleteNote(rent.id);
    nb = await loadNotebook();
    expect(nb.notes.map((n) => n.text)).toEqual(["Call the landlord"]);
  });

  it("saves settings one at a time — the currency, the general savings goal — and validates links", async () => {
    await expect(saveSettings({ currency: "ZZZZ" })).rejects.toThrow(/currency/);
    expect(await saveSettings({ currency: "rwf" })).toEqual({ currency: "RWF", generalGoal: null, generalStart: null });
    expect(await saveSettings({ generalGoal: "1000000", generalStart: 50000 })).toEqual({ currency: "RWF", generalGoal: 1000000, generalStart: 50000 });
    expect(await saveSettings({ generalGoal: "" })).toMatchObject({ currency: "RWF", generalGoal: null, generalStart: 50000 });
    expect((await loadNotebook()).settings).toEqual({ currency: "RWF", generalGoal: null, generalStart: 50000 });
    const watch = await createKillItem({ name: "Watch" });
    await expect(updateKillItem(watch.id, { link: "javascript:alert(1)" })).rejects.toThrow(/http/);
  });
});
