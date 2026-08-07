"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RMultipleBucket } from "@/lib/types";
import { formatSignedCurrency } from "@/lib/utils";

function RTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: RMultipleBucket }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (d.count === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="font-medium">{d.bucket}</div>
      <div className="tabular-nums text-muted">
        {d.count} trade{d.count === 1 ? "" : "s"}
      </div>
      <div className="tabular-nums" style={{ color: d.pnl >= 0 ? "var(--profit)" : "var(--loss)" }}>
        {formatSignedCurrency(d.pnl)}
      </div>
    </div>
  );
}

export default function RMultipleHistogram({ data }: { data: RMultipleBucket[] }) {
  const hasData = data.some((b) => b.count > 0);
  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted">
        No R-multiple data recorded yet.
      </div>
    );
  }
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="bucket"
            interval={1}
            axisLine={{ stroke: "var(--chart-axis)" }}
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 10 }}
          />
          <YAxis hide />
          <Tooltip content={<RTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={500}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.min < 0 ? "var(--loss)" : "var(--profit)"}
                fillOpacity={d.count === 0 ? 0.2 : 0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
