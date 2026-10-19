import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

/**
 * Deterministic SYNTHETIC test fixture in HistData Generic ASCII format
 * (EST, UTC−5). It is not market data and is only used by tests.
 */
export function writeHistdataFixture(dir: string, name: string, fromUtc: number, minutes: number, price: (i: number) => number): { file: string; rows: number } {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const lines: string[] = [];
  for (let i = 0; i < minutes; i++) {
    const t = fromUtc + i * 60;
    const utc = new Date(t * 1000);
    const dow = utc.getUTCDay();
    const hour = utc.getUTCHours();
    // Skip the weekly closure (Fri 22:00 → Sun 22:00 UTC).
    if (dow === 6 || (dow === 5 && hour >= 22) || (dow === 0 && hour < 22)) continue;
    const d = new Date((t - 5 * 3600) * 1000);
    const ts = `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())} ${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00`;
    const o = price(i);
    const c = price(i + 1);
    const h = Math.max(o, c) + 0.00015;
    const l = Math.min(o, c) - 0.00015;
    lines.push(`${ts};${o.toFixed(6)};${h.toFixed(6)};${l.toFixed(6)};${c.toFixed(6)};0`);
  }
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return { file, rows: lines.length };
}

export async function login(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: { email: "e2e@replay.test", password: "e2e-password" } });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
}
