"use client";

import { useId, useMemo } from "react";
import { Activity, Clock, TrendingDown } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import type { BacktestTrade } from "@/lib/testing/types";
import { computeDrawdown, type DrawdownPoint } from "@/lib/testing/stats";
import { formatCurrency, formatPercent } from "@/lib/utils";

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

export default function DrawdownTab({
  trades,
  startingBalance,
}: {
  trades: BacktestTrade[];
  startingBalance: number;
}) {
  const gradientId = useId();
  const drawdown = useMemo(() => computeDrawdown(trades, startingBalance), [trades, startingBalance]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Max drawdown" icon={TrendingDown} accent={drawdown.maxDrawdown > 0 ? "loss" : "muted"}>
          <div className="mt-2 text-xl font-semibold tabular-nums text-loss">{formatCurrency(drawdown.maxDrawdown)}</div>
          <p className="mt-1 text-xs text-muted">{formatPercent(drawdown.maxDrawdownPct, 1)} from peak</p>
        </StatTile>
        <StatTile label="Current drawdown" icon={Activity} accent={drawdown.currentDrawdown > 0 ? "loss" : "muted"}>
          <div className="mt-2 text-xl font-semibold tabular-nums">{formatCurrency(drawdown.currentDrawdown)}</div>
          <p className="mt-1 text-xs text-muted">{formatPercent(drawdown.currentDrawdownPct, 1)} from peak</p>
        </StatTile>
        <StatTile label="Longest drawdown" icon={Clock} accent="muted">
          <div className="mt-2 text-xl font-semibold tabular-nums">{drawdown.longestDrawdownDays}</div>
          <p className="mt-1 text-xs text-muted">days underwater</p>
        </StatTile>
        <StatTile label="Trading days" icon={Clock} accent="muted">
          <div className="mt-2 text-xl font-semibold tabular-nums">{drawdown.series.length}</div>
          <p className="mt-1 text-xs text-muted">with a recorded balance</p>
        </StatTile>
      </div>

      <Card padding="lg">
        <h3 className="text-sm font-semibold">Underwater equity</h3>
        <p className="mb-3 text-xs text-muted">Drawdown from peak balance over time</p>
        {drawdown.series.length === 0 ? (
          <div className="flex h-52 items-center justify-center text-sm text-muted">No closed trades yet</div>
        ) : (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drawdown.series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
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
        )}
      </Card>
    </div>
  );
}
