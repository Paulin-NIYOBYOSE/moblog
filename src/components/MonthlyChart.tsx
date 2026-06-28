"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart2 } from "lucide-react";
import type { Trade } from "@/lib/types";
import {
  aggregateByMonth,
  cn,
  formatCurrency,
  formatSignedCurrency,
  MONTHS,
} from "@/lib/utils";

export default function MonthlyChart({
  trades,
  year = new Date().getFullYear(),
}: {
  trades: Trade[];
  year?: number;
}) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const gradientId = useId();

  const byMonth = aggregateByMonth(trades);
  const map = new Map(byMonth.map((m) => [m.month, m]));

  const data = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    const agg = map.get(key);
    return {
      key,
      label: MONTHS[i].slice(0, 3),
      fullLabel: MONTHS[i],
      pnl: agg?.pnl ?? 0,
      trades: agg?.trades ?? 0,
    };
  });

  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.pnl)));
  const total = data.reduce((sum, d) => sum + d.pnl, 0);
  const activeMonths = data.filter((d) => d.trades > 0).length;

  const dataKey = data.map((d) => d.pnl).join(",");
  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, [dataKey]);

  const W = 900;
  const H = 320;
  const pad = { top: 24, right: 16, bottom: 40, left: 56 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const n = data.length;
  const barW = (chartW / n) * 0.55;
  const zeroY = pad.top + chartH / 2;

  const yFor = (pnl: number) => zeroY - (pnl / maxAbs) * (chartH / 2);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-medium text-muted">Monthly PnL</h3>
          </div>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tracking-tight tabular-nums",
              total >= 0 ? "text-foreground" : "text-loss",
            )}
          >
            {formatSignedCurrency(total)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
            {year}
          </span>
          <span className="text-xs text-muted">
            {activeMonths} active month{activeMonths === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="mt-5 w-full overflow-hidden animate-fade-in">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-72 w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--profit)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--profit)" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {/* Grid lines and labels */}
          {[0, 0.5, 1].map((t, i) => {
            const y = pad.top + chartH * t;
            const value = maxAbs * (1 - t * 2);
            return (
              <g key={i}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={W - pad.right}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                />
                <text
                  x={pad.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted text-[11px]"
                >
                  {formatCurrency(value, { compact: true })}
                </text>
              </g>
            );
          })}

          {/* Zero line */}
          <line
            x1={pad.left}
            y1={zeroY}
            x2={W - pad.right}
            y2={zeroY}
            stroke="var(--muted)"
            strokeWidth={1}
          />

          {/* Bars */}
          {data.map((d, i) => {
            const x = pad.left + (i + 0.5) * (chartW / n) - barW / 2;
            const y = yFor(d.pnl);
            const height = Math.max(4, Math.abs(zeroY - y));
            const positive = d.pnl >= 0;
            const hasData = d.trades > 0;
            const isHover = hover === i;
            const barY = d.pnl === 0 ? zeroY - 2 : Math.min(y, zeroY);
            return (
              <g
                key={d.key}
                className="cursor-pointer"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => router.push(`/analytics?month=${d.key}`)}
              >
                <rect
                  x={x}
                  y={barY}
                  width={barW}
                  height={height}
                  rx={4}
                  fill={
                    hasData
                      ? positive
                        ? `url(#${gradientId})`
                        : "var(--loss)"
                      : "var(--muted)"
                  }
                  opacity={isHover ? 1 : hasData ? 0.9 : 0.35}
                  className={cn(
                    "transition-all duration-200 ease-out",
                    hasData && mounted
                      ? positive
                        ? "animate-grow-bar"
                        : "animate-grow-bar-down"
                      : "",
                  )}
                  style={{
                    animationDelay: hasData ? `${i * 60}ms` : "0ms",
                    filter: isHover ? "brightness(1.15)" : "brightness(1)",
                    transition: "opacity 200ms ease-out, filter 200ms ease-out",
                  }}
                />
                {hasData && height > 18 && (
                  <text
                    x={x + barW / 2}
                    y={
                      positive
                        ? Math.min(y, zeroY) + 14
                        : Math.max(y, zeroY) - 6
                    }
                    textAnchor="middle"
                    className="fill-white text-[11px] font-medium"
                  >
                    {formatCurrency(d.pnl, { compact: true })}
                  </text>
                )}
                <text
                  x={x + barW / 2}
                  y={H - 12}
                  textAnchor="middle"
                  className={cn(
                    "text-[12px]",
                    hasData ? "fill-foreground font-medium" : "fill-muted",
                  )}
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        <div
          className={cn(
            "pointer-events-none mt-1 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg transition-all duration-200 ease-out",
            hover !== null
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-1",
          )}
        >
          <div className="font-medium">
            {hover !== null ? data[hover].fullLabel : "—"}
          </div>
          <div
            className={cn(
              "tabular-nums",
              hover !== null && data[hover].pnl >= 0
                ? "text-profit"
                : "text-loss",
            )}
          >
            {hover !== null ? formatSignedCurrency(data[hover].pnl) : "—"}
          </div>
          {hover !== null && (
            <div className="text-[10px] text-muted">
              {data[hover].trades > 0
                ? `${data[hover].trades} trade${data[hover].trades === 1 ? "" : "s"}`
                : "No trading activity"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
