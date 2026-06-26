"use client";

import { useId } from "react";
import type { Trade } from "@/lib/types";
import { equitySeries, formatCurrency } from "@/lib/utils";

export default function EquityCurve({ trades, startingBalance }: { trades: Trade[]; startingBalance: number }) {
  const gradientId = useId();
  const series = equitySeries(trades, startingBalance);

  const W = 100;
  const H = 42;

  let path = "";
  let area = "";
  let last = startingBalance;

  if (series.length > 1) {
    const values = series.map((s) => s.value);
    const min = Math.min(startingBalance, ...values);
    const max = Math.max(startingBalance, ...values);
    const range = max - min || 1;
    const n = series.length;

    const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v: number) => H - ((v - min) / range) * H;

    const pts = series.map((s, i) => `${x(i).toFixed(2)},${y(s.value).toFixed(2)}`);
    path = `M ${pts.join(" L ")}`;
    area = `${path} L ${x(n - 1).toFixed(2)},${H} L ${x(0).toFixed(2)},${H} Z`;
    last = values[values.length - 1];
  }

  const positive = last >= startingBalance;
  const stroke = positive ? "var(--profit)" : "var(--loss)";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-muted">Equity curve</h3>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums" style={{ color: stroke }}>
            {formatCurrency(last)}
          </p>
        </div>
        <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">{series.length - 1} day{series.length - 2 === 1 ? "" : "s"}</span>
      </div>

      <div className="mt-4 h-28 w-full">
        {series.length <= 1 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">No closed trades yet</div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
