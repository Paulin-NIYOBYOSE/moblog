"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeekdayAggregate } from "@/lib/types";
import { formatPercent, formatSignedCurrency } from "@/lib/utils";

function WeekdayTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: WeekdayAggregate }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="font-medium">{d.label}</div>
      <div className="tabular-nums" style={{ color: d.pnl >= 0 ? "var(--profit)" : "var(--loss)" }}>
        {formatSignedCurrency(d.pnl)}
      </div>
      <div className="text-[10px] text-muted">
        {d.trades > 0 ? `${d.trades} trades · ${formatPercent(d.winRate, 0)} win` : "No trades"}
      </div>
    </div>
  );
}

export default function WeekdayBars({ data }: { data: WeekdayAggregate[] }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="label"
            axisLine={{ stroke: "var(--chart-axis)" }}
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
          />
          <YAxis hide />
          <Tooltip content={<WeekdayTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="pnl" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={500}>
            {data.map((d) => (
              <Cell
                key={d.weekday}
                fill={d.trades === 0 ? "var(--border)" : d.pnl >= 0 ? "var(--profit)" : "var(--loss)"}
                fillOpacity={d.trades === 0 ? 0.4 : 0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
