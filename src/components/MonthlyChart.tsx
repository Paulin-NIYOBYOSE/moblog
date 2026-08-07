"use client";

import { useRouter } from "next/navigation";
import { BarChart2 } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategoricalChartFunc } from "recharts/types/chart/types";
import type { Trade } from "@/lib/types";
import { aggregateByMonth, cn, formatCurrency, formatSignedCurrency, MONTHS } from "@/lib/utils";
import Card from "./ui/Card";

function MonthlyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { fullLabel: string; pnl: number; trades: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="font-medium">{d.fullLabel}</div>
      <div
        className="tabular-nums"
        style={{ color: d.pnl >= 0 ? "var(--profit)" : "var(--loss)" }}
      >
        {formatSignedCurrency(d.pnl)}
      </div>
      <div className="text-[10px] text-muted">
        {d.trades > 0 ? `${d.trades} trade${d.trades === 1 ? "" : "s"}` : "No trading activity"}
      </div>
    </div>
  );
}

export default function MonthlyChart({
  trades,
  year = new Date().getFullYear(),
}: {
  trades: Trade[];
  year?: number;
}) {
  const router = useRouter();
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

  const total = data.reduce((sum, d) => sum + d.pnl, 0);
  const activeMonths = data.filter((d) => d.trades > 0).length;

  const handleClick: CategoricalChartFunc = (state) => {
    const idx = state?.activeIndex;
    if (typeof idx === "number" && data[idx]) {
      router.push(`/analytics?month=${data[idx].key}`);
    }
  };

  return (
    <Card padding="lg">
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

      <div className="mt-5 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} onClick={handleClick}>
            <XAxis
              dataKey="label"
              axisLine={{ stroke: "var(--chart-axis)" }}
              tickLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(v) => formatCurrency(v, { compact: true })}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              width={56}
            />
            <Tooltip content={<MonthlyTooltip />} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="pnl" radius={[4, 4, 4, 4]} isAnimationActive animationDuration={500} className="cursor-pointer">
              {data.map((d) => (
                <Cell
                  key={d.key}
                  fill={d.trades === 0 ? "var(--border)" : d.pnl >= 0 ? "var(--profit)" : "var(--loss)"}
                  fillOpacity={d.trades === 0 ? 0.5 : 0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
