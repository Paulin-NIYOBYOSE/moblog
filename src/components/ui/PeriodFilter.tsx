"use client";

import { CalendarRange, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { cn, todayKey } from "@/lib/utils";
import { periodLabel, shiftPeriod, type Period, type PeriodPreset } from "@/lib/periods";
import SegmentedControl from "./SegmentedControl";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
];

/**
 * One control for every time filter in the app: pick a granularity, then step
 * through periods with the arrows (or set a custom from/to range).
 */
export default function PeriodFilter({
  value,
  onChange,
  presets = PRESETS.map((p) => p.value),
  className,
}: {
  value: Period;
  onChange: (next: Period) => void;
  presets?: PeriodPreset[];
  className?: string;
}) {
  const steppable = value.preset !== "all" && value.preset !== "custom";
  const isCurrent =
    steppable &&
    periodLabel(value) === periodLabel({ ...value, anchor: todayKey() });

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <SegmentedControl
        options={PRESETS.filter((p) => presets.includes(p.value))}
        value={value.preset}
        onChange={(preset) => onChange({ ...value, preset, anchor: value.anchor || todayKey() })}
      />
      {steppable && (
        <div className="flex items-center rounded-[0.7rem] border border-border bg-surface shadow-xs dark:bg-surface-2">
          <button
            type="button"
            onClick={() => onChange(shiftPeriod(value, -1))}
            aria-label="Previous period"
            className="flex h-8 w-8 items-center justify-center rounded-l-[0.7rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground dark:hover:bg-surface-3"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="flex min-w-[7.5rem] items-center justify-center gap-1.5 px-1 text-xs font-semibold">
            <CalendarRange className="h-3.5 w-3.5 text-muted" />
            {periodLabel(value)}
          </span>
          <button
            type="button"
            onClick={() => onChange(shiftPeriod(value, 1))}
            aria-label="Next period"
            className="flex h-8 w-8 items-center justify-center rounded-r-[0.7rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground dark:hover:bg-surface-3"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      {steppable && !isCurrent && (
        <button
          type="button"
          onClick={() => onChange({ ...value, anchor: todayKey() })}
          className="btn btn-ghost btn-sm"
          title="Jump to the current period"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Current
        </button>
      )}
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.from ?? ""}
            onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
            className="input h-8 w-[9.5rem] py-1 text-xs"
            aria-label="From date"
          />
          <span className="text-xs text-muted">→</span>
          <input
            type="date"
            value={value.to ?? ""}
            onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
            className="input h-8 w-[9.5rem] py-1 text-xs"
            aria-label="To date"
          />
        </div>
      )}
    </div>
  );
}
