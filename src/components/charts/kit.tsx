"use client";

// Shared chart chrome — one tooltip, one axis style, one gauge/ring language
// across Analytics, Journal and Backtesting v2. Marks follow the dataviz spec:
// thin bars (<= 24px, 4px data-end radius), 2px lines, hairline solid grids,
// ~10% area washes, legends whenever two or more series share a plot.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const AXIS_TICK = { fill: "var(--muted)", fontSize: 11 } as const;
export const GRID_STROKE = "var(--chart-grid)";
export const AXIS_STROKE = "var(--chart-axis)";
export const BAR_MAX = 24;
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
export const HBAR_RADIUS: [number, number, number, number] = [0, 4, 4, 0];

/** Compact money for axis ticks: $650, $1.2K, −$3K. */
export function axisMoney(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}$${+(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `${sign}$${+(a / 1000).toFixed(1)}K`;
  return `${sign}$${Math.round(a)}`;
}

export function pnlColor(v: number): string {
  return v > 0 ? "var(--profit)" : v < 0 ? "var(--loss)" : "var(--muted)";
}

export function ChartTooltipBox({
  title,
  rows,
  footer,
}: {
  title?: ReactNode;
  rows: { label: ReactNode; value: ReactNode; color?: string; tone?: "profit" | "loss" | "muted" }[];
  footer?: ReactNode;
}) {
  return (
    <div className="min-w-[9rem] rounded-xl border border-border bg-card/95 px-3 py-2.5 text-xs shadow-xl backdrop-blur">
      {title && <div className="mb-1.5 font-semibold">{title}</div>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                r.tone === "profit" && "text-profit",
                r.tone === "loss" && "text-loss",
                r.tone === "muted" && "text-muted",
              )}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1.5 border-t border-border pt-1.5 text-[10px] text-muted">{footer}</div>}
    </div>
  );
}

export function LegendItem({ color, label, shape = "dot" }: { color: string; label: ReactNode; shape?: "dot" | "line" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      {shape === "dot" ? (
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      ) : (
        <span className="h-0.5 w-3 rounded-full" style={{ background: color }} />
      )}
      {label}
    </span>
  );
}

export function ChartEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-[10rem] items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-sm text-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Semicircle gauge — segments share a 180° track with 2px surface gaps.
// ---------------------------------------------------------------------------

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  // Angles run counter-clockwise from 0° (right) — we draw 180° → 0°.
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = Math.abs(startDeg - endDeg) > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function SemiGauge({
  segments,
  size = 120,
  stroke = 10,
  children,
}: {
  segments: { value: number; color: string; label?: string }[];
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const gapDeg = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 2.5 : 0;
  let cursor = 180;
  const arcs: { d: string; color: string; key: number }[] = [];
  if (total > 0) {
    segments.forEach((seg, i) => {
      if (seg.value <= 0) return;
      const sweep = (seg.value / total) * 180;
      const start = cursor;
      const end = cursor - sweep;
      cursor = end;
      const s = start - (start === 180 ? 0 : gapDeg / 2);
      const e = end + (end <= 0.001 ? 0 : gapDeg / 2);
      if (s - e > 0.5) arcs.push({ d: arcPath(cx, cy, r, s, e), color: seg.color, key: i });
    });
  }
  return (
    <div className="relative" style={{ width: size, height: size / 2 + stroke / 2 }}>
      <svg width={size} height={size / 2 + stroke / 2} viewBox={`0 0 ${size} ${size / 2 + stroke / 2}`}>
        <path d={arcPath(cx, cy, r, 180, 0)} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} strokeLinecap="round" />
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill="none" stroke={a.color} strokeWidth={stroke} strokeLinecap="round" />
        ))}
      </svg>
      {children && <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress ring
// ---------------------------------------------------------------------------

export function ProgressRing({
  percent,
  size = 96,
  stroke = 8,
  color = "var(--accent)",
  children,
  className,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (p / 100) * c}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  );
}

/** Horizontal two-part ratio bar (e.g. avg win vs avg loss). */
export function RatioBar({ a, b, aColor = "var(--profit)", bColor = "var(--loss)" }: { a: number; b: number; aColor?: string; bColor?: string }) {
  const total = Math.abs(a) + Math.abs(b);
  const pa = total ? (Math.abs(a) / total) * 100 : 50;
  return (
    <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pa}%`, background: total ? aColor : "var(--surface-3)" }} />
      <div className="h-full flex-1 rounded-full transition-all duration-700" style={{ background: total ? bColor : "var(--surface-3)" }} />
    </div>
  );
}

/** Inline magnitude bar for table cells; diverges around zero. */
export function InlineBar({ value, max, positiveColor = "var(--profit)", negativeColor = "var(--loss)" }: { value: number; max: number; positiveColor?: string; negativeColor?: string }) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div className="flex h-1.5 w-full items-center">
      <div className="relative h-full w-1/2">
        {value < 0 && (
          <div className="absolute right-0 top-0 h-full rounded-l-full" style={{ width: `${pct}%`, background: negativeColor }} />
        )}
      </div>
      <div className="h-2.5 w-px bg-border-strong" />
      <div className="relative h-full w-1/2">
        {value > 0 && <div className="absolute left-0 top-0 h-full rounded-r-full" style={{ width: `${pct}%`, background: positiveColor }} />}
      </div>
    </div>
  );
}
