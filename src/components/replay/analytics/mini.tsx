"use client";

import { useId } from "react";

// Small SVG charts for KPI cards (FX Replay / journal-style dashboards).

/** Semi-circle gauge split into win / breakeven / loss counts. */
export function WinGauge({ wins, losses, breakeven, size = 120 }: { wins: number; losses: number; breakeven: number; size?: number }) {
  const total = wins + losses + breakeven;
  const r = 40;
  const c = Math.PI * r; // half circumference
  const seg = (n: number) => (total ? (n / total) * c : 0);
  const w = seg(wins);
  const b = seg(breakeven);
  const l = seg(losses);
  return (
    <svg viewBox="0 0 100 56" width={size} height={(size * 56) / 100} aria-hidden>
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--surface-3)" strokeWidth="9" strokeLinecap="round" />
      {total > 0 && (
        <>
          <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--profit)" strokeWidth="9" strokeDasharray={`${w} ${c}`} />
          <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--info)" strokeWidth="9" strokeDasharray={`0 ${w} ${b} ${c}`} />
          <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--loss)" strokeWidth="9" strokeDasharray={`0 ${w + b} ${l} ${c}`} />
        </>
      )}
    </svg>
  );
}

/** Full ring: share of `value` in `value + rest` (e.g. gross profit vs gross loss). */
export function Ring({ value, rest, size = 64, color = "var(--profit)", restColor = "var(--loss)" }: { value: number; rest: number; size?: number; color?: string; restColor?: string }) {
  const total = Math.abs(value) + Math.abs(rest);
  const r = 26;
  const c = 2 * Math.PI * r;
  const share = total ? (Math.abs(value) / total) * c : 0;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="-rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke={total ? restColor : "var(--surface-3)"} strokeWidth="7" />
      {total > 0 && <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${share} ${c}`} />}
    </svg>
  );
}

/** Horizontal two-part bar (avg win vs avg loss). */
export function SplitBar({ left, right }: { left: number; right: number }) {
  const total = Math.abs(left) + Math.abs(right);
  const lw = total ? (Math.abs(left) / total) * 100 : 50;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
      {total > 0 && (
        <>
          <span className="h-full bg-profit" style={{ width: `${lw}%` }} />
          <span className="h-full bg-loss" style={{ width: `${100 - lw}%` }} />
        </>
      )}
    </div>
  );
}

/** Area sparkline that turns red below the starting value. */
export function Sparkline({ values, base, height = 64 }: { values: number[]; base: number; height?: number }) {
  const id = useId().replace(/:/g, "");
  if (values.length < 2) return <div style={{ height }} className="flex items-center justify-center text-[11px] text-faint">Close a trade to draw the curve</div>;
  const W = 300;
  const H = height;
  const min = Math.min(base, ...values);
  const max = Math.max(base, ...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const yb = y(base);
  const last = values[values.length - 1];
  const color = last >= base ? "var(--profit)" : "var(--loss)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${yb} L0 ${yb} Z`} fill={`url(#g${id})`} />
      <path d={`M0 ${yb} H${W}`} stroke="var(--chart-axis)" strokeDasharray="3 3" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
