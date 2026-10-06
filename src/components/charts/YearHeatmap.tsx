"use client";

import { useMemo, useState } from "react";
import { cn, dateKey, MONTHS } from "@/lib/utils";

export interface HeatCell {
  value: number;
  /** Tooltip lines. */
  lines?: string[];
}

type Mode = "diverging" | "sequential";

const STEPS = [22, 42, 66, 92];

function cellColor(value: number, max: number, mode: Mode, seqColor: string): string {
  if (max <= 0) return "var(--border-strong)";
  const level = Math.min(STEPS.length - 1, Math.max(0, Math.ceil((Math.abs(value) / max) * STEPS.length) - 1));
  const pct = STEPS[level];
  if (mode === "sequential") return `color-mix(in srgb, ${seqColor} ${pct}%, var(--surface-3))`;
  if (value === 0) return "var(--border-strong)";
  const hue = value > 0 ? "var(--profit)" : "var(--loss)";
  return `color-mix(in srgb, ${hue} ${pct}%, var(--surface-3))`;
}

/**
 * GitHub-style year grid (Mon-first weeks). Diverging mode encodes P&L sign by
 * hue and magnitude by 4 lightness steps around a neutral midpoint; sequential
 * mode uses a single hue light→dark.
 */
export default function YearHeatmap({
  year,
  cells,
  mode = "diverging",
  seqColor = "var(--accent)",
  onSelect,
  legendLow = "Loss",
  legendHigh = "Profit",
}: {
  year: number;
  cells: Map<string, HeatCell>;
  mode?: Mode;
  seqColor?: string;
  onSelect?: (day: string) => void;
  legendLow?: string;
  legendHigh?: string;
}) {
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null);

  const { weeks, monthStarts, max } = useMemo(() => {
    const first = new Date(year, 0, 1);
    const offset = (first.getDay() + 6) % 7; // Mon=0
    const start = new Date(year, 0, 1 - offset);
    const weeks: { key: string; inYear: boolean }[][] = [];
    const monthStarts: { month: number; week: number }[] = [];
    const cursor = new Date(start);
    let w = 0;
    while (cursor.getFullYear() <= year && !(cursor.getFullYear() === year + 1)) {
      const col: { key: string; inYear: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const inYear = cursor.getFullYear() === year;
        if (inYear && cursor.getDate() === 1) monthStarts.push({ month: cursor.getMonth(), week: w });
        col.push({ key: dateKey(cursor), inYear });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(col);
      w++;
      if (cursor.getFullYear() > year) break;
    }
    let max = 0;
    for (const [k, c] of cells) if (k.startsWith(String(year))) max = Math.max(max, Math.abs(c.value));
    return { weeks, monthStarts, max };
  }, [year, cells]);

  const hovered = hover ? cells.get(hover.day) : undefined;

  const cols = weeks.length;
  return (
    <div className="relative" data-heatmap-root>
      <div className="overflow-x-auto pb-1 no-scrollbar">
        <div className="min-w-[720px]">
          <div className="relative ml-8 h-4 text-[10px] text-muted">
            {monthStarts.map((m) => (
              <span key={m.month} className="absolute" style={{ left: `${(m.week / cols) * 100}%` }}>
                {MONTHS[m.month].slice(0, 3)}
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1">
            <div className="grid w-7 shrink-0 grid-rows-7 gap-[3px] text-[9px] text-faint">
              {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
                <span key={i} className="flex items-center">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {weeks.map((col, wi) => (
                <div key={wi} className="grid grid-rows-7 gap-[3px]">
                  {col.map((c) => {
                    if (!c.inYear) return <span key={c.key} className="aspect-square" />;
                    const cell = cells.get(c.key);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => onSelect?.(c.key)}
                        onMouseEnter={(e) => {
                          const host = e.currentTarget.closest("[data-heatmap-root]") as HTMLElement | null;
                          const rect = host?.getBoundingClientRect();
                          const r = e.currentTarget.getBoundingClientRect();
                          setHover({ day: c.key, x: r.left - (rect?.left ?? 0) + r.width / 2, y: r.top - (rect?.top ?? 0) });
                        }}
                        onMouseLeave={() => setHover(null)}
                        onBlur={() => setHover(null)}
                        aria-label={c.key}
                        className={cn(
                          "aspect-square w-full rounded-[3px] transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none",
                          !onSelect && "cursor-default",
                        )}
                        style={{ background: cell ? cellColor(cell.value, max, mode, seqColor) : "var(--surface-3)" }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted">
        <span>{mode === "diverging" ? legendLow : "Less"}</span>
        {mode === "diverging" &&
          [...STEPS].reverse().map((s) => (
            <span key={`l${s}`} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--loss) ${s}%, var(--surface-3))` }} />
          ))}
        <span className="h-2.5 w-2.5 rounded-[3px] bg-surface-3" />
        {STEPS.map((s) => (
          <span
            key={`h${s}`}
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: `color-mix(in srgb, ${mode === "diverging" ? "var(--profit)" : seqColor} ${s}%, var(--surface-3))` }}
          />
        ))}
        <span>{mode === "diverging" ? legendHigh : "More"}</span>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          <div className="font-semibold">
            {new Date(`${hover.day}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </div>
          {hovered?.lines?.length ? (
            hovered.lines.map((l, i) => (
              <div key={i} className="text-muted">
                {l}
              </div>
            ))
          ) : (
            <div className="text-muted">No activity</div>
          )}
        </div>
      )}
    </div>
  );
}
