import { prisma } from "@/lib/prisma";
import { CHECKLIST_KEYS } from "@/lib/strategy";
import {
  DAY_RE,
  toBoolOrNull,
  toIntInRange,
  toStringArray,
  toTextOrNull,
} from "./parse";

/**
 * Validates a journal payload. `create` requires `day`; updates only touch
 * the keys present in the body.
 */
export async function journalData(
  body: Record<string, unknown>,
  create: boolean,
): Promise<{ data: Record<string, unknown> } | { error: string }> {
  const data: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (create || has("day")) {
    const day = String(body.day ?? "");
    if (!DAY_RE.test(day)) return { error: "A valid day (yyyy-mm-dd) is required." };
    data.day = day;
  }
  if (create || has("accountId")) {
    const accountId = body.accountId ? String(body.accountId) : null;
    if (accountId) {
      const exists = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true } });
      if (!exists) return { error: "Account not found." };
    }
    data.accountId = accountId;
  }
  if (create || has("title")) data.title = toTextOrNull(body.title, 200);
  if (create || has("mood")) data.mood = toIntInRange(body.mood, 1, 5);
  if (create || has("discipline")) data.discipline = toIntInRange(body.discipline, 1, 5);
  if (create || has("followedPlan")) data.followedPlan = toBoolOrNull(body.followedPlan);
  if (create || has("checklist")) {
    data.checklist = toStringArray(body.checklist, 20).filter((k) => CHECKLIST_KEYS.includes(k));
  }
  for (const key of ["emotionsBefore", "emotionsAfter", "mistakes", "tags", "tradeIds"] as const) {
    if (create || has(key)) data[key] = toStringArray(body[key], key === "tradeIds" ? 200 : 50);
  }
  for (const key of ["premarket", "notes", "lessons"] as const) {
    if (create || has(key)) data[key] = toTextOrNull(body[key]);
  }
  return { data };
}
