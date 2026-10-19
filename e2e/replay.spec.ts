import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { login, writeHistdataFixture } from "./fixtures";

const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;

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

/** Import a CSV on the Datasets page (stored in the database). */
async function importDataset(page: Page, file: string) {
  await page.goto("/replay/datasets");
  await page.getByRole("button", { name: "Import data" }).first().click();
  await page.getByTestId("import-file").setInputFiles(file);
  await expect(page.getByRole("dialog").getByText("HistData — Generic ASCII M1")).toBeVisible();
  await page.getByTestId("import-parse").click();
  await expect(page.getByTestId("import-commit")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("import-commit").click();
  await page.getByTestId("import-done").click({ timeout: 300_000 });
}

/** From the Datasets page: wizard with that dataset → workspace. */
async function sessionFromDataset(page: Page, from: string, to: string, history = "0") {
  await page.getByRole("link", { name: "New session" }).first().click();
  await expect(page.getByTestId("wizard-from")).toBeVisible();
  await page.getByTestId("wizard-from").fill(from);
  await page.getByTestId("wizard-to").fill(to);
  await page.getByLabel("History before the start").selectOption(history);
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-start").click();
  await expect(page.getByTestId("replay-workstation")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("[data-testid=replay-chart] canvas").first()).toBeVisible();
}

test("create session → automatic FXCM download → replay → trade → journal → reload → analytics (real data)", async ({ page, browser }) => {
  test.setTimeout(420_000);
  const errors = collectErrors(page);
  await login(page);
  await page.goto("/replay");
  await expect(page.getByText("Start your first backtest")).toBeVisible();
  await page.getByTestId("create-session").first().click();

  // 1. Market
  await page.getByTestId("wizard-search").fill("eurusd");
  await page.getByTestId("instrument-EURUSD").click();
  await page.getByTestId("wizard-next").click();
  // 2. Period & timeframe: one trading week of March 2024, with a week of history before it.
  await page.getByTestId("wizard-from").fill("2024-03-11");
  await page.getByTestId("wizard-to").fill("2024-03-15");
  await page.getByLabel("History before the start").selectOption("7");
  await expect(page.getByTestId("wizard-next")).toBeEnabled({ timeout: 90_000 }); // availability probed against FXCM
  await expect(page.getByText("To download")).toBeVisible(); // coverage preview from the live FXCM probe
  await page.getByTestId("wizard-next").click();
  // 3. Trading settings (defaults: $10,000, 1% risk) → 4. Review → start.
  await page.getByTestId("wizard-next").click();
  await expect(page.getByText("Start backtesting")).toBeVisible();
  await page.getByTestId("wizard-start").click();

  // Preparation: real download into the database, then straight into the workspace.
  await expect(page.getByTestId("preparation-screen")).toBeVisible();
  await expect(page.getByTestId("replay-workstation")).toBeVisible({ timeout: 300_000 });
  await expect(page.locator("[data-testid=replay-chart] canvas").first()).toBeVisible();
  const sessionUrl = page.url();
  expect(sessionUrl).toMatch(/\/replay\/session\/[^/]+\/chart$/);
  const sessionId = sessionUrl.split("/").at(-2)!;

  // The candles really came from FXCM and are in the database.
  const datasets = await (await page.request.get("/api/replay/datasets")).json();
  const ds = datasets.find((d: { id: string }) => d.id === "fxcm_EURUSD_M1");
  expect(ds, "FXCM dataset missing").toBeTruthy();
  expect(ds.count).toBeGreaterThan(10_000); // two trading weeks of M1 bars
  expect(Object.values(ds.provider.chunks).filter((c) => (c as { status: string }).status === "ok").length).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("replay-time")).toContainText("11 Mar 2024");

  // Replay forward and trade: buy with a 10-pip stop and 20-pip target, sized at 1% risk.
  for (let i = 0; i < 8; i++) await page.getByTestId("replay-next").click();
  await page.getByTestId("side-buy").click();
  await page.getByTestId("ticket-sl").fill("10");
  await page.getByTestId("ticket-tp").fill("20");
  await expect(page.getByTestId("ticket-lots")).toContainText("lots");
  await page.getByTestId("ticket-submit").click();
  await expect(page.getByTestId("position-row")).toHaveCount(1);
  for (let i = 0; i < 2; i++) await page.getByTestId("replay-next").click();
  // Close manually if the stop/target hasn't been reached yet.
  if ((await page.getByTestId("position-row").count()) > 0) await page.getByTestId("close-position").click();
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByTestId("history-row")).toHaveCount(1);

  // Journal a note without leaving the workspace.
  await page.getByRole("button", { name: "Open journal for this trade" }).click();
  await page.getByPlaceholder("What happened, in a sentence…").fill("E2E note: real FXCM data");
  await page.getByRole("button", { name: "Save journal" }).click();
  await expect(page.getByText("E2E note: real FXCM data")).toHaveCount(0); // modal closed

  // Save, reload and resume at the same replay point with the trade and note intact.
  await page.getByTestId("replay-save").click();
  await expect(page.getByTestId("replay-save")).toContainText("Saved");
  const replayTime = await page.getByTestId("replay-time").innerText();
  await page.reload();
  await expect(page.getByTestId("replay-workstation")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("preparation-screen")).toHaveCount(0); // data already stored
  await expect(page.getByTestId("replay-time")).toHaveText(replayTime);
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByTestId("history-row")).toHaveCount(1);
  await page.getByRole("tab", { name: "Journal", exact: true }).click();
  await expect(page.getByText("E2E note: real FXCM data")).toBeVisible();

  // Analytics and the session detail page derive from the same ledger.
  await page.goto(`/replay/analytics?session=${sessionId}`);
  await expect(page.getByTestId("analytics-trade-row")).toHaveCount(1);
  await page.goto(`/replay/session/${sessionId}`);
  await expect(page.getByTestId("session-stats")).toContainText("Trades");
  await expect(page.getByTestId("detail-trade-row")).toHaveCount(1);

  // Stored in the database, not the browser: a brand-new browser profile sees it all.
  const fresh = await browser.newContext({ baseURL: page.url().split("/replay")[0] });
  const p2 = await fresh.newPage();
  await login(p2);
  await p2.goto("/replay");
  await expect(p2.getByTestId("session-card-title")).toHaveCount(1);
  await p2.goto(`/replay/session/${sessionId}/chart`);
  await expect(p2.getByTestId("replay-time")).toHaveText(replayTime, { timeout: 120_000 });
  await fresh.close();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("imported CSV → database → wizard → replay → TP exit → CSV export", async ({ page }, info) => {
  const errors = collectErrors(page);
  // Synthetic fixture (not market data): a slow uptrend from Wed 3 Jan 2024, then a decline.
  const { file, rows } = writeHistdataFixture(info.outputDir, "DAT_ASCII_EURUSD_M1_2024.csv", utc(2024, 1, 2), 4 * 1440, (i) =>
    i < 3440 ? 1.1 + i * 0.00002 + Math.sin(i / 7) * 0.00004 : 1.16 - (i - 3440) * 0.00003,
  );
  await login(page);
  await importDataset(page, file);
  await expect(page.getByTestId("dataset-list")).toContainText(rows.toLocaleString());
  await sessionFromDataset(page, "2024-01-03", "2024-01-05", "7");
  await expect(page.getByTestId("replay-time")).toContainText("03 Jan 2024");

  await page.getByTestId("side-buy").click();
  await page.getByTestId("ticket-sl").fill("10");
  await page.getByTestId("ticket-tp").fill("20");
  await page.getByTestId("ticket-submit").click();
  await expect(page.getByTestId("position-row")).toHaveCount(1);
  await page.getByTestId("replay-play").click();
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByTestId("history-row")).toHaveCount(1, { timeout: 90_000 });
  await expect(page.getByTestId("history-row").first()).toContainText("tp");

  await page.goto("/replay/journal");
  await expect(page.getByText("EURUSD").first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  const csvPath = path.join(info.outputDir, "trades.csv");
  await (await download).saveAs(csvPath);
  const csv = await (await import("node:fs/promises")).readFile(csvPath, "utf8");
  expect(csv.split("\n")).toHaveLength(2);
  expect(csv).toContain(",long,market,M15,");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("large dataset: one year of M1 imports, stores and replays without freezing @perf", async ({ page }, info) => {
  test.setTimeout(900_000);
  const minutes = 366 * 1440;
  const t0 = Date.now();
  const { file, rows } = writeHistdataFixture(info.outputDir, "DAT_ASCII_GBPUSD_M1_2024.csv", utc(2024, 1, 1), minutes, (i) => 1.27 + Math.sin(i / 900) * 0.01 + Math.sin(i / 37) * 0.0006);
  const genMs = Date.now() - t0;
  await login(page);
  const tImport = Date.now();
  await importDataset(page, file);
  const importMs = Date.now() - tImport;

  const tOpen = Date.now();
  await sessionFromDataset(page, "2024-07-01", "2024-12-31", "91");
  const openMs = Date.now() - tOpen;

  const tSteps = Date.now();
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("replay-time")).toContainText("10:00");
  const stepMs = Date.now() - tSteps;

  const timings = { rows, genMs, importParseUploadMs: importMs, wizardToChartMs: openMs, fortyStepsMs: stepMs };
  info.annotations.push({ type: "perf", description: JSON.stringify(timings) });
  console.log("PERF", JSON.stringify(timings));
  expect(stepMs).toBeLessThan(20_000);
});

test("dragging a position's take-profit line on the chart modifies it; stepping back asks before undoing", async ({ page }, info) => {
  const { file } = writeHistdataFixture(info.outputDir, "DAT_ASCII_EURUSD_M1_2024.csv", utc(2024, 1, 2), 3 * 1440, (i) => 1.1 + Math.sin(i / 60) * 0.0006);
  await login(page);
  await importDataset(page, file);
  await sessionFromDataset(page, "2024-01-03", "2024-01-04", "7");
  await page.getByTestId("replay-next").click();
  await page.getByTestId("replay-next").click();
  await page.getByTestId("ticket-sl").fill("15");
  await page.getByTestId("ticket-tp").fill("15");
  await page.getByTestId("ticket-submit").click();
  await expect(page.getByTestId("position-row")).toHaveCount(1);
  // Clear the ticket so only the position's own SL/TP lines are draggable.
  await page.getByTestId("ticket-sl").fill("");
  await page.getByTestId("ticket-tp").fill("");
  const tpInput = page.getByTestId("position-row").getByLabel("Take-profit");
  const before = Number(await tpInput.inputValue());

  const chart = page.getByTestId("replay-chart");
  const box = (await chart.boundingBox())!;
  const x = box.x + box.width * 0.5;
  let lineY: number | null = null;
  for (let y = box.y + 20; y < box.y + box.height * 0.7; y += 2) {
    await page.mouse.move(x, y);
    if ((await chart.evaluate((el) => el.style.cursor)) === "ns-resize") {
      lineY = y;
      break;
    }
  }
  expect(lineY, "no draggable line found").not.toBeNull();
  await page.mouse.down();
  await page.mouse.move(x, lineY! - 30, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await tpInput.inputValue())).toBeGreaterThan(before);

  // Step back before the entry: a confirmation must appear and cancelling keeps the trade.
  await page.getByTestId("replay-back").click();
  await expect(page.getByText("Step back and undo?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("position-row")).toHaveCount(1);
  await page.getByTestId("replay-back").click();
  await page.getByRole("button", { name: "Undo and step back" }).click();
  await expect(page.getByTestId("position-row")).toHaveCount(0);
});

/** Right edge of the main chart pane (left of the price axis), in page coordinates. */
async function paneRightEdge(page: Page): Promise<number> {
  return page.getByTestId("replay-chart").evaluate((el) => {
    const rects = Array.from(el.querySelectorAll("canvas")).map((c) => c.getBoundingClientRect());
    rects.sort((a, b) => b.width * b.height - a.width * a.height);
    return rects[0].right;
  });
}

/** Scan one column (top → bottom) or one row (left → right) for a cursor style. */
async function scanFor(page: Page, want: string, pts: { x: number; y: number }[]) {
  const chart = page.getByTestId("replay-chart");
  for (const p of pts) {
    await page.mouse.move(p.x, p.y);
    if ((await chart.evaluate((el) => el.style.cursor)) === want) return p;
  }
  return null;
}
const column = (x: number, y0: number, y1: number, step = 2) => Array.from({ length: Math.ceil((y1 - y0) / step) }, (_, i) => ({ x, y: y0 + i * step }));
const row = (y: number, x0: number, x1: number, step = 3) => Array.from({ length: Math.ceil((x1 - x0) / step) }, (_, i) => ({ x: x0 + i * step, y }));

test("FX Replay-style chart trading: position tool, trade pills, ghost SL, right-click orders", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { file } = writeHistdataFixture(info.outputDir, "DAT_ASCII_EURUSD_M1_2024.csv", utc(2024, 1, 2), 3 * 1440, (i) => 1.1 + Math.sin(i / 90) * 0.0012);
  await login(page);
  await importDataset(page, file);
  await sessionFromDataset(page, "2024-01-03", "2024-01-04", "7");
  for (let i = 0; i < 3; i++) await page.getByTestId("replay-next").click();
  const box = (await page.getByTestId("replay-chart").boundingBox())!;
  const paneRight = await paneRightEdge(page);
  const top = box.y + 30;
  const bottom = box.y + box.height - 60;

  // 1) Long position tool → Place order (Enter) → pre-filled dialog → market fill.
  await page.getByRole("button", { name: "Long position" }).click();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Place long order");
  await expect(page.getByRole("dialog")).toContainText("Reward : risk");
  // The tool sits wherever we clicked, so use the pending order at its entry
  // (a market buy is correctly refused if the stop ended up above the market).
  await page.getByRole("tab", { name: /^Buy (stop|limit) @/ }).click();
  await page.getByTestId("projection-place").click();
  await page.getByRole("tab", { name: /^Orders/ }).click();
  await expect(page.getByRole("button", { name: /Cancel/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Cancel/ }).first().click();
  await page.getByRole("tab", { name: /^Positions/ }).click();

  // 2) Market trade without stops → drag the "+ SL" ghost below the entry.
  await page.getByTestId("ticket-sl").fill("");
  await page.getByTestId("ticket-tp").fill("");
  await page.getByRole("button", { name: "lots", exact: true }).click();
  await page.getByTestId("ticket-submit").click();
  await expect(page.getByTestId("position-row")).toHaveCount(1);
  const closeX = paneRight - 17; // ✕ cell of the right-aligned pill
  const pillRow = await scanFor(page, "pointer", column(closeX, top, bottom));
  expect(pillRow, "position pill not found").not.toBeNull();
  const ghost = await scanFor(page, "ns-resize", row(pillRow!.y, paneRight - 480, paneRight - 150));
  expect(ghost, "ghost +SL pill not found").not.toBeNull();
  await page.mouse.move(ghost!.x, ghost!.y);
  await page.mouse.down();
  await page.mouse.move(ghost!.x, ghost!.y + 45, { steps: 6 });
  await page.mouse.up();
  const slInput = page.getByTestId("position-row").getByLabel("Stop-loss");
  await expect.poll(async () => Number(await slInput.inputValue())).toBeGreaterThan(0);

  // 3) ✕ on the position pill closes the trade (the SL pill has its own ✕).
  await page.mouse.move(box.x + 40, bottom);
  const close = await scanFor(page, "pointer", column(closeX, pillRow!.y - 6, pillRow!.y + 6, 1));
  expect(close, "✕ button not found").not.toBeNull();
  await page.mouse.click(close!.x, close!.y);
  await expect(page.getByTestId("position-row")).toHaveCount(0);
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByTestId("history-row")).toHaveCount(1);

  // 4) Right-click → pending order at that price.
  await page.mouse.click(box.x + box.width * 0.4, box.y + 60, { button: "right" });
  const menu = page.getByTestId("chart-context-menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: /Sell limit/ }).click();
  await page.getByRole("tab", { name: /Orders/ }).click();
  await expect(page.getByText("Sell limit").first()).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("drawing tools: fibonacci, text, line drag, lock, undo/redo, hide — saved to the database", async ({ page }, info) => {
  const errors = collectErrors(page);
  const { file } = writeHistdataFixture(info.outputDir, "DAT_ASCII_EURUSD_M1_2024.csv", utc(2024, 1, 2), 3 * 1440, (i) => 1.1 + Math.sin(i / 90) * 0.0012);
  await login(page);
  await importDataset(page, file);
  await sessionFromDataset(page, "2024-01-03", "2024-01-04", "7");
  const sessionId = page.url().split("/").at(-2)!;
  const box = (await page.getByTestId("replay-chart").boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const drawings = async () => {
    await page.getByTestId("replay-save").click();
    await expect(page.getByTestId("replay-save")).toContainText("Saved");
    return (await (await page.request.get(`/api/replay/sessions/${sessionId}`)).json()).drawings as { kind: string; text?: string; locked?: boolean; points: { t: number; p: number }[] }[];
  };

  // Fibonacci: two clicks → seven levels; undo removes it, redo restores it.
  await page.getByRole("button", { name: /^Fibonacci retracement/ }).click();
  let a = at(0.3, 0.7);
  await page.mouse.click(a.x, a.y);
  a = at(0.5, 0.3);
  await page.mouse.click(a.x, a.y);
  await expect(page.getByTestId("drawing-settings")).toContainText("Fibonacci");
  await page.keyboard.press("Escape");
  await page.getByTestId("drawing-undo").click();
  expect((await drawings()).filter((d) => d.kind === "fib")).toHaveLength(0);
  await page.getByTestId("drawing-redo").click();
  expect((await drawings()).filter((d) => d.kind === "fib")).toHaveLength(1);

  // Text note, edited from the floating settings bar.
  await page.getByRole("button", { name: /^Text note/ }).click();
  a = at(0.25, 0.2);
  await page.mouse.click(a.x, a.y);
  await page.getByTestId("drawing-text").fill("Breakout zone");
  await page.getByTestId("drawing-text").press("Enter");
  await page.keyboard.press("Escape");

  // Horizontal line via keyboard shortcut, then drag it.
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.keyboard.press("Alt+KeyH");
  const lineY = box.y + box.height * 0.5;
  await page.mouse.click(box.x + box.width * 0.4, lineY);
  await page.keyboard.press("Escape");
  const before = (await drawings()).find((d) => d.kind === "hline")!.points[0].p;
  await page.mouse.move(box.x + box.width * 0.6, lineY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, lineY - 40, { steps: 5 });
  await page.mouse.up();
  const moved = (await drawings()).find((d) => d.kind === "hline")!.points[0].p;
  expect(moved).toBeGreaterThan(before);

  // Locked lines can't be dragged.
  await page.mouse.click(box.x + box.width * 0.6, lineY - 40);
  await page.getByTestId("drawing-settings").getByRole("button", { name: "Lock" }).click();
  await page.mouse.move(box.x + box.width * 0.6, lineY - 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, lineY + 30, { steps: 5 });
  await page.mouse.up();
  const locked = (await drawings()).find((d) => d.kind === "hline")!;
  expect(locked.locked).toBe(true);
  expect(locked.points[0].p).toBe(moved);

  // Everything survives a reload; hiding drawings is remembered too.
  await page.reload();
  await expect(page.getByTestId("replay-workstation")).toBeVisible({ timeout: 120_000 });
  const saved = await drawings();
  expect(saved.map((d) => d.kind).sort()).toEqual(["fib", "hline", "text"]);
  expect(saved.find((d) => d.kind === "text")!.text).toBe("Breakout zone");
  await page.getByRole("button", { name: "Hide drawings" }).click();
  await page.getByTestId("replay-save").click();
  await expect(page.getByTestId("replay-save")).toContainText("Saved");
  const s = await (await page.request.get(`/api/replay/sessions/${sessionId}`)).json();
  expect(s.chartPrefs.hideDrawings).toBe(true);
  expect(errors, errors.join("\n")).toEqual([]);
});
