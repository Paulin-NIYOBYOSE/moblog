"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DrawdownPoint } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

function DrawdownTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: DrawdownPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="text-muted">{label}</div>
      <div className="font-semibold tabular-nums text-loss">
        {formatCurrency(d.drawdown)} ({d.drawdownPct.toFixed(1)}%)
      </div>
    </div>
  );
}

export default function DrawdownChart({ series }: { series: DrawdownPoint[] }) {
  const gradientId = useId();

  if (series.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted">
        No closed trades yet
      </div>
    );
  }

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--loss)" stopOpacity={0} />
              <stop offset="100%" stopColor="var(--loss)" stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={["dataMin", 0]} />
          <Tooltip content={<DrawdownTooltip />} cursor={{ stroke: "var(--chart-axis)" }} />
          <Area
            type="monotone"
            dataKey="drawdown"
            stroke="var(--loss)"
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
