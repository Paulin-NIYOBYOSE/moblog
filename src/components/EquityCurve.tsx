"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import type { Trade } from "@/lib/types";
import { equitySeries, formatCurrency, dateKey, cn } from "@/lib/utils";

export default function EquityCurve({
  trades,
  startingBalance,
}: {
  trades: Trade[];
  startingBalance: number;
}) {
  const router = useRouter();
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [hover, setHover] = useState<{
    i: number;
    x: number;
    y: number;
  } | null>(null);
  const [pathLength, setPathLength] = useState(0);
  const [drawn, setDrawn] = useState(false);

  const series = equitySeries(trades, startingBalance);

  const W = 100;
  const H = 42;

  let path = "";
  let area = "";
  let last = startingBalance;
  let min = startingBalance;
  let max = startingBalance;
  let range = 1;

  if (series.length > 1) {
    const values = series.map((s) => s.value);
    min = Math.min(startingBalance, ...values);
    max = Math.max(startingBalance, ...values);
    range = max - min || 1;
    const n = series.length;

    const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v: number) => H - ((v - min) / range) * H;

    const pts = series.map(
      (s, i) => `${x(i).toFixed(2)},${y(s.value).toFixed(2)}`,
    );
    path = `M ${pts.join(" L ")}`;
    area = `${path} L ${x(n - 1).toFixed(2)},${H} L ${x(0).toFixed(2)},${H} Z`;
    last = values[values.length - 1];
  }

  const positive = last >= startingBalance;
  const stroke = positive ? "var(--profit)" : "var(--loss)";

  const tradeKey = series.map((s) => s.value).join(",");
  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    setPathLength(len);
    setDrawn(false);
    const t = setTimeout(() => setDrawn(true), 30);
    return () => clearTimeout(t);
  }, [tradeKey]);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (series.length <= 1) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const n = series.length;
    const i = Math.min(n - 1, Math.max(0, Math.round(x * (n - 1))));
    const value = series[i].value;
    const y = 1 - (value - min) / range;
    setHover({ i, x: (i / (n - 1)) * W, y: y * H });
  }

  function handleClick() {
    if (!hover) return;
    const point = series[hover.i];
    if (!point) return;
    router.push(`/analytics?date=${point.date}`);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-medium text-muted">Equity curve</h3>
          </div>
          <p
            className="mt-1 text-2xl font-semibold tracking-tight tabular-nums"
            style={{ color: stroke }}
          >
            {formatCurrency(last)}
          </p>
        </div>
        <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
          {series.length - 1} day{series.length - 2 === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 h-28 w-full">
        {series.length <= 1 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            No closed trades yet
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-full w-full cursor-pointer overflow-visible"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHover(null)}
            onClick={handleClick}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={area}
              fill={`url(#${gradientId})`}
              className="animate-fade-in"
              style={{ animationDuration: "0.8s" }}
            />
            <path
              ref={pathRef}
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{
                strokeDasharray: pathLength,
                strokeDashoffset: drawn ? 0 : pathLength,
                transition:
                  "stroke-dashoffset 0.8s ease-out, stroke 0.3s ease-out",
              }}
            />
            {hover && (
              <>
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={0}
                  y2={H}
                  stroke="currentColor"
                  strokeOpacity={0.3}
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                  className="transition-all duration-150 ease-out"
                />
                <circle
                  cx={hover.x}
                  cy={hover.y}
                  r={1.5}
                  fill="var(--background)"
                  stroke={stroke}
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                  className="transition-all duration-150 ease-out"
                />
              </>
            )}
          </svg>
        )}
      </div>

      <div
        className={cn(
          "mt-2 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm transition-all duration-200 ease-out",
          hover
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1 pointer-events-none",
        )}
      >
        <span className="text-muted">{hover ? series[hover.i].date : "—"}</span>
        <span className="font-semibold tabular-nums" style={{ color: stroke }}>
          {hover ? formatCurrency(series[hover.i].value) : "—"}
        </span>
      </div>
    </div>
  );
}
