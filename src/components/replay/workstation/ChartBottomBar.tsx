"use client";

import { CalendarRange } from "lucide-react";
import type { ControllerSnapshot } from "@/lib/replay/controller";
import { DISPLAY_TIMEZONES, formatInTz } from "@/lib/replay/time";
import { cn } from "@/lib/utils";
import Popover from "../Popover";
import { GoToPopover } from "./ChartTopBar";

export type ScaleMode = "normal" | "percent" | "log";

const RANGES: { label: string; days: number; title: string }[] = [
  { label: "5y", days: 1826, title: "Last 5 years" },
  { label: "1y", days: 365, title: "Last year" },
  { label: "6m", days: 182, title: "Last 6 months" },
  { label: "3m", days: 91, title: "Last 3 months" },
  { label: "1m", days: 30, title: "Last month" },
  { label: "5d", days: 5, title: "Last 5 days" },
  { label: "1d", days: 1, title: "Last day" },
];

const base = "h-7 shrink-0 rounded-md px-1.5 text-[12.5px] font-medium transition-colors hover:bg-surface-2";
const btn = `${base} text-foreground/80 hover:text-foreground`;
const on = `${base} text-accent`;

/** TradingView's bottom bar: visible-range presets, Go to, replay clock, scale modes. */
export default function ChartBottomBar({
  snap,
  onRange,
  onJump,
  onTimezone,
  scaleMode,
  onScaleMode,
  autoScale,
  onAutoScale,
}: {
  snap: ControllerSnapshot;
  onRange: (days: number) => void;
  onJump: (t: number) => void;
  onTimezone: (tz: string) => void;
  scaleMode: ScaleMode;
  onScaleMode: (m: ScaleMode) => void;
  autoScale: boolean;
  onAutoScale: (v: boolean) => void;
}) {
  const tz = snap.session.displayTimezone;
  const zone = DISPLAY_TIMEZONES.find((z) => z.value === tz);
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-t border-border px-2" data-testid="chart-bottom-bar">
      <div className="flex min-w-0 items-center overflow-x-auto no-scrollbar" role="group" aria-label="Visible range">
        {RANGES.map((r) => (
          <button key={r.label} type="button" className={btn} title={`${r.title} up to the replay point`} onClick={() => onRange(r.days)}>
            {r.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <GoToPopover snap={snap} onJump={onJump}>
          {(open) => (
            <button type="button" className={cn(btn, "px-1")} onClick={open} title="Go to a date" aria-label="Go to a date">
              <CalendarRange className="h-4 w-4" />
            </button>
          )}
        </GoToPopover>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <Popover
          align="right"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className={cn(btn, "tabular-nums")} title="Replay time — click to change the time zone" data-testid="replay-time">
              {formatInTz(snap.nowT, tz, "datetime")} <span className="text-muted">({zone?.value === "UTC" ? "UTC" : zone?.label ?? tz})</span>
            </button>
          )}
          className="!bottom-full !top-auto !mb-1.5 !mt-0 w-64 !p-1.5"
        >
          {(close) => (
            <div role="menu" aria-label="Time zone" className="max-h-72 overflow-y-auto">
              {DISPLAY_TIMEZONES.map((z) => (
                <button
                  key={z.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={z.value === tz}
                  onClick={() => {
                    onTimezone(z.value);
                    close();
                  }}
                  className={cn("flex w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2", z.value === tz && "text-accent")}
                >
                  {z.label}
                </button>
              ))}
            </div>
          )}
        </Popover>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <button type="button" className={scaleMode === "percent" ? on : btn} aria-pressed={scaleMode === "percent"} onClick={() => onScaleMode(scaleMode === "percent" ? "normal" : "percent")} title="Percentage scale">
          %
        </button>
        <button type="button" className={scaleMode === "log" ? on : btn} aria-pressed={scaleMode === "log"} onClick={() => onScaleMode(scaleMode === "log" ? "normal" : "log")} title="Logarithmic scale">
          log
        </button>
        <button type="button" className={autoScale ? on : btn} aria-pressed={autoScale} onClick={() => onAutoScale(!autoScale)} title="Auto-fit the price scale to the visible candles">
          auto
        </button>
      </div>
    </div>
  );
}
