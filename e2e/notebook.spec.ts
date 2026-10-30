import { expect, test, type Page } from "@playwright/test";
import { login } from "./fixtures";

test.beforeEach(async () => {
  const { resetTestDb } = await import("../scripts/test-db.mjs");
  resetTestDb();
});

const ignoredConsole = /api\/(accounts|trades|journal)\b|Failed to load resource|ECONNREFUSED/;

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !ignoredConsole.test(m.text())) errors.push(m.text());
  });
  return errors;
}

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const tab = (page: Page, name: string) => page.getByRole("tablist", { name: "Notebook" }).getByRole("tab", { name });

test("notebook: plan the month, income flows to general savings, save for the kill list, analytics and notes", async ({ page }) => {
  const errors = collectErrors(page);
  const today = localDay();
  // Another day of this week (Monday, or Tuesday when today is Monday).
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const otherDay = localDay(monday.getTime() === new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() ? new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1) : monday);
  await login(page);

  // Sidebar → Notebook: four tabs, the budget first, and the month's saying.
  await page.goto("/");
  await page.getByRole("link", { name: /Notebook/ }).first().click();
  await expect(page).toHaveURL(/\/notebook$/);
  await expect(page.getByRole("tablist", { name: "Notebook" }).getByRole("tab")).toHaveCount(4);
  for (const name of ["Budget", "General savings", "Analytics", "Notes"]) await expect(tab(page, name)).toBeVisible();
  await expect(tab(page, "Budget")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("saying")).toBeVisible();

  // Budget: currency, then the month's plan — what isn't planned is shown going to general savings.
  await page.getByTestId("currency-RWF").click();
  await page.getByTestId("currency-save").click();
  await page.getByTestId("start-plan").click();
  await page.locator('input[name="plan-income"]').fill("500000");
  await page.locator('input[name="plan-Food & groceries"]').fill("100000");
  await expect(page.getByTestId("plan-to-assign")).toContainText("400,000 goes to general savings");
  await page.getByTestId("plan-save").click();
  await expect(page.getByTestId("budget-left")).toContainText("100,000");
  await expect(page.getByTestId("budget-general")).toContainText("Gets the income you don't plan for");

  // The salary comes in: the unplanned 400,000 goes to general savings by itself.
  await page.getByTestId("add-income").click();
  await page.locator('input[name="entry-amount"]').fill("500000");
  await page.getByRole("dialog").getByPlaceholder("Salary, a client, a gift…").fill("Salary");
  await page.getByTestId("entry-save").click();
  await expect(page.getByTestId("budget-received")).toContainText("500,000");
  await expect(page.getByTestId("budget-general")).toContainText("+RWF 400,000");
  await tab(page, "General savings").click();
  await expect(page.getByTestId("general-balance")).toContainText("400,000");

  // The kill list lives here too: two things, target the phone, save toward the laptop.
  for (const [name, price] of [
    ["Laptop", "150000"],
    ["Phone", "80000"],
  ]) {
    await page.getByTestId("kill-name").fill(name);
    await page.locator('input[name="kill-price"]').fill(price);
    await page.getByTestId("kill-add").click();
    await expect(page.getByTestId("kill-open")).toContainText(name);
  }
  await expect(page.getByTestId("kill-target")).toHaveText("Laptop");
  await page.getByTestId("kill-target-Phone").click();
  await expect(page.getByTestId("kill-target")).toHaveText("Phone");
  await page.getByTestId("kill-save-Laptop").click();
  await page.locator('input[name="save-amount"]').fill("100000");
  await page.getByTestId("save-confirm").click();
  await expect(page.getByTestId("kill-saved")).toContainText("100,000");
  await expect(page.getByTestId("kill-item-Laptop")).toContainText("50,000 to go");
  // Saved for the laptop out of what was unplanned: general savings has less, the total is the same.
  await expect(page.getByTestId("general-balance")).toContainText("300,000");
  await expect(page.getByTestId("savings-total")).toContainText("400,000");

  // Buy the laptop: its savings pay first, the month only the rest.
  await page.getByTestId("kill-it-Laptop").click();
  await expect(page.locator('input[name="kill-paid"]')).toHaveValue("150000");
  await expect(page.getByTestId("kill-split")).toContainText("100,000");
  await expect(page.getByTestId("kill-split")).toContainText("50,000");
  await page.getByTestId("kill-confirm").click();
  await expect(page.getByTestId("kill-open")).not.toContainText("Laptop");
  await page.getByRole("button", { name: /Killed \(1\)/ }).click();
  await expect(page.getByTestId("kill-killed")).toContainText("100,000 from savings");

  // Back on the budget: the rest of the laptop, some food, and 30,000 planned for the phone — saved from the budget.
  await tab(page, "Budget").click();
  await expect(page.getByTestId("budget-spent")).toContainText("50,000");
  await expect(page.getByTestId("budget-lines")).toContainText("Kill list purchases");
  await page.getByTestId("add-expense").click();
  await page.locator('input[name="entry-amount"]').fill("5000");
  await page.getByRole("dialog").getByRole("radio", { name: "🛒 Food & groceries" }).click();
  await page.getByTestId("entry-save").click();
  await expect(page.getByTestId("budget-left")).toContainText("45,000"); // 100,000 planned − 50,000 (the laptop beyond its savings) − 5,000
  await page.getByTestId("edit-plan").click();
  await page.locator('input[name="plan-save-🎯 Phone"]').fill("30000");
  await expect(page.getByTestId("plan-to-assign")).toContainText("370,000 goes to general savings");
  await page.getByTestId("plan-save").click();
  const phoneLine = page.getByTestId("saving-🎯 Phone");
  await expect(phoneLine).toContainText("30,000 to go");
  await phoneLine.getByRole("button", { name: "Save" }).click();
  await expect(page.locator('input[name="save-amount"]')).toHaveValue("30000");
  await page.getByTestId("save-confirm").click();
  await expect(phoneLine).toContainText("Done ✓");
  // 500,000 − 100,000 kept for spending − 130,000 saved for the laptop and the phone.
  await expect(page.getByTestId("budget-general")).toContainText("+RWF 270,000");
  await page.screenshot({ path: test.info().outputPath("budget.png"), fullPage: true });

  // General savings: the balance, a goal to reach, and the kill list's own savings.
  await tab(page, "General savings").click();
  await expect(page.getByTestId("general-balance")).toContainText("270,000");
  await expect(page.getByTestId("kill-item-Phone")).toContainText("30,000 saved");
  await page.getByTestId("general-edit").click();
  await page.locator('input[name="general-goal"]').fill("1000000");
  await page.getByTestId("general-save").click();
  await expect(page.getByTestId("general-goal")).toContainText("27% of your RWF");
  await expect(page.getByTestId("savings-total")).toContainText("300,000");
  await page.getByRole("button", { name: "How it adds up" }).click();
  await expect(page.getByTestId("general-how")).toContainText("+RWF 270,000");
  await page.screenshot({ path: test.info().outputPath("savings.png"), fullPage: true });

  // Analytics: the month's income, spending and where it went.
  await tab(page, "Analytics").click();
  await expect(page.getByTestId("analytics-income")).toContainText("500,000");
  await expect(page.getByTestId("analytics-spent")).toContainText("55,000");
  await expect(page.getByTestId("analytics-months")).toContainText("+RWF 270,000");
  await expect(page.getByTestId("analytics-categories")).toContainText("Food & groceries");
  await expect(page.getByTestId("analytics-categories")).toContainText("Kill list purchases");
  await page.screenshot({ path: test.info().outputPath("analytics.png"), fullPage: true });

  // Notes: write on today's page, tick a line off, change one, and plan another day.
  await tab(page, "Notes").click();
  const input = page.getByTestId(`note-input-${today}`);
  await input.fill("Pay school fees");
  await input.press("Enter");
  await input.fill("Call the landlord");
  await input.press("Enter");
  await expect(page.getByTestId(`notes-day-${today}`)).toContainText("Pay school fees");
  const fees = page.getByRole("checkbox", { name: "Done: Pay school fees" });
  await fees.click();
  await expect(fees).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Call the landlord", exact: true }).click();
  await page.getByLabel("Change the note").fill("Call the landlord at 5pm");
  await page.getByLabel("Change the note").press("Enter");
  await expect(page.getByTestId(`notes-day-${today}`)).toContainText("Call the landlord at 5pm");
  await page.getByTestId(`note-add-${otherDay}`).click();
  await page.getByTestId(`note-input-${otherDay}`).fill("Gym");
  await page.getByTestId(`note-input-${otherDay}`).press("Enter");
  await expect(page.getByTestId(`notes-day-${otherDay}`)).toContainText("Gym");
  await page.getByTestId("note-Gym").hover();
  await page.getByRole("button", { name: "Delete “Gym”" }).click();
  await expect(page.getByTestId(`notes-day-${otherDay}`)).not.toContainText("Gym");

  // Everything is in the database.
  await page.goto("/notebook?tab=notes");
  await expect(page.getByRole("checkbox", { name: "Done: Pay school fees" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("notes-week")).not.toContainText("Gym");
  await page.goto("/notebook?tab=savings");
  await expect(page.getByTestId("general-balance")).toContainText("270,000");
  await expect(page.getByTestId("general-goal")).toContainText("27%");
  await page.goto("/notebook");
  await expect(page.getByTestId("budget-left")).toContainText("45,000");

  expect(errors).toEqual([]);
});

test("notebook fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const today = localDay();
  const month = today.slice(0, 7);
  const api = async (method: "post" | "put", url: string, data: object) => (await page.request[method](url, { data })).json();
  await api("put", "/api/notebook/settings", { currency: "RWF", generalGoal: 2000000 });
  const item = await api("post", "/api/notebook/kill", { name: "Noise-cancelling headphones", price: 95000 });
  await api("post", "/api/notebook/kill", { name: "HP series 24 inch", price: 300000 });
  const { categories } = await api("put", `/api/notebook/budget/months/${month}`, {
    income: 450000,
    categories: [
      { name: "General use", emoji: "🧾", planned: 50000 },
      { name: "Food & groceries", emoji: "🛒", planned: 120000 },
    ],
    saving: { [`k:${item.id}`]: 30000 },
  });
  await api("post", "/api/notebook/budget/entries", { day: today, kind: "income", amount: 450000, note: "Salary" });
  await api("post", "/api/notebook/budget/entries", { day: today, kind: "expense", amount: 4500, categoryId: categories[1].id, note: "Lunch" });
  await api("post", "/api/notebook/budget/entries", { day: today, kind: "saving", amount: 40000, killItemId: item.id });
  await api("post", "/api/notebook/notes", { day: today, text: "Pay the electricity bill before Friday and keep the receipt" });

  for (const [key, name] of [
    ["budget", "Budget"],
    ["savings", "General savings"],
    ["analytics", "Analytics"],
    ["notes", "Notes"],
  ]) {
    await page.goto(key === "budget" ? "/notebook" : `/notebook?tab=${key}`);
    await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: test.info().outputPath(`phone-${key}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${key} scrolls sideways`).toBeLessThanOrEqual(390);
  }
});

test("notebook: every month's budget is its own — copy last month, then change this one only", async ({ page }) => {
  await login(page);
  const month = localDay().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  await page.request.put("/api/notebook/settings", { data: { currency: "USD" } });
  await page.request.put(`/api/notebook/budget/months/${prev}`, {
    data: {
      income: 3000,
      categories: [
        { name: "Rent", emoji: "🏠", planned: 1200 },
        { name: "Food", emoji: "🛒", planned: 400 },
      ],
      saving: {},
    },
  });

  await page.goto("/notebook");
  await page.getByTestId("copy-plan").click();
  await expect(page.getByTestId("budget-left")).toContainText("$1,600");
  await expect(page.getByTestId("budget-lines")).toContainText("🏠 Rent");

  // Remove Rent from this month only.
  await page.getByTestId("edit-plan").click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove Rent" }).click();
  await page.getByTestId("plan-save").click();
  await expect(page.getByText(/Only .*'s budget changes — other months keep theirs\./)).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByTestId("budget-left")).toContainText("$400");
  await expect(page.getByTestId("budget-lines")).not.toContainText("Rent");

  // Last month still has it.
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByTestId("budget-lines")).toContainText("🏠 Rent");
  await expect(page.getByTestId("budget-left")).toContainText("$1,600");
});
