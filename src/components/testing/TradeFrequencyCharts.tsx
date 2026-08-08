"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/ui/Card";
import type { FrequencySeries } from "@/lib/testing/frequency";

function FrequencyTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; count: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="font-medium">{d.label}</div>
      <div className="tabular-nums text-accent">{d.count} trade{d.count === 1 ? "" : "s"}</div>
    </div>
  );
}

function FrequencyPanel({ title, series }: { title: string; series: FrequencySeries }) {
  return (
    <Card padding="lg">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
          Avg <span className="font-semibold text-foreground">{series.avg.toFixed(series.avg % 1 === 0 ? 0 : 2)}</span>
        </span>
      </div>
      <div className="mt-3 h-40 w-full">
        {series.buckets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">No trades yet</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series.buckets} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="label"
                axisLine={{ stroke: "var(--chart-axis)" }}
                tickLine={false}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
              />
              <YAxis hide />
              <Tooltip content={<FrequencyTooltip />} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={500} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export default function TradeFrequencyCharts({
  byWeekday,
  byWeek,
  byMonth,
}: {
  byWeekday: FrequencySeries;
  byWeek: FrequencySeries;
  byMonth: FrequencySeries;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">Average trade frequency</h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FrequencyPanel title="Trades / day" series={byWeekday} />
        <FrequencyPanel title="Trades / week" series={byWeek} />
        <FrequencyPanel title="Trades / month" series={byMonth} />
      </div>
    </div>
  );
}
