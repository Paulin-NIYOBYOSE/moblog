// DRIPDOLLAR strategy — the A+ checklist used when journaling. Each item is a
// one-tap yes/no on the journal entry; the grade is derived from how many
// held, so analytics can compare A+ days against lower-quality ones.

export const STRATEGY_NAME = "DRIPDOLLAR";

export const CHECKLIST: { key: string; label: string; short: string; tf: "W" | "D" | "4H" | "1H" | "Risk" }[] = [
  { key: "weekly", label: "Weekly direction is clear", short: "Weekly clear", tf: "W" },
  { key: "agree", label: "Daily direction agrees with Weekly", short: "D agrees W", tf: "D" },
  { key: "cleanDaily", label: "Clean Daily HH/HL or LH/LL", short: "Clean structure", tf: "D" },
  { key: "d123", label: "Clean Daily 1-2-3", short: "Daily 1-2-3", tf: "D" },
  { key: "poi", label: "Price is at a meaningful HTF POI", short: "At HTF POI", tf: "D" },
  { key: "displacement", label: "4H displacement is strong", short: "Strong displacement", tf: "4H" },
  { key: "close", label: "4H closes beyond structure", short: "4H close beyond", tf: "4H" },
  { key: "retest", label: "4H retest is clean", short: "Clean retest", tf: "4H" },
  { key: "hold", label: "Retest holds / rejects correctly", short: "Retest holds", tf: "4H" },
  { key: "trigger", label: "1H confirmation is clear", short: "1H confirmation", tf: "1H" },
  { key: "room", label: "At least 2R of clean room", short: "2R+ room", tf: "Risk" },
  { key: "sl", label: "SL is at structural invalidation", short: "Structural SL", tf: "Risk" },
  { key: "risk", label: "Risk is within plan (1%)", short: "Risk ≤ 1%", tf: "Risk" },
];

export const CHECKLIST_KEYS = CHECKLIST.map((c) => c.key);

export type Grade = "A+" | "A" | "B" | "C";
export const GRADES: Grade[] = ["A+", "A", "B", "C"];

/** Grade for a set of ticked items; null when nothing was ticked (no setup). */
export function gradeFor(checked: string[]): Grade | null {
  const n = checked.filter((k) => CHECKLIST_KEYS.includes(k)).length;
  if (n === 0) return null;
  const total = CHECKLIST.length;
  return n === total ? "A+" : n >= total - 2 ? "A" : n >= 8 ? "B" : "C";
}

export const GRADE_STYLE: Record<Grade, { color: string; chip: string }> = {
  "A+": { color: "var(--gold)", chip: "bg-gold-soft text-gold ring-1 ring-inset ring-gold/30" },
  A: { color: "var(--accent)", chip: "bg-accent-soft text-accent" },
  B: { color: "var(--info)", chip: "bg-info-soft text-info" },
  C: { color: "var(--muted)", chip: "bg-surface-3 text-muted" },
};
