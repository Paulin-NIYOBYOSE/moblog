"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Brush,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DotProps } from "recharts";
import type { CategoricalChartFunc } from "recharts/types/chart/types";
import type { Trade } from "@/lib/types";
import { equitySeries, formatCurrency } from "@/lib/utils";
import Card from "./ui/Card";

function EquityTooltip({
  active,
  payload,
  label,
  startingBalance,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  startingBalance: number;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const positive = value >= startingBalance;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <div className="text-muted">{label === "start" ? "Start" : label}</div>
      <div
        className="font-semibold tabular-nums"
        style={{ color: positive ? "var(--profit)" : "var(--loss)" }}
      >
        {formatCurrency(value)}
      </div>
    </div>
  );
}

function EquityActiveDot(props: DotProps & { payload?: { value: number }; startingBalance: number }) {
  const { cx, cy, payload, startingBalance } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  const positive = payload.value >= startingBalance;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="var(--card)"
      stroke={positive ? "var(--profit)" : "var(--loss)"}
      strokeWidth={2}
    />
  );
}

export default function EquityCurve({
  trades,
  startingBalance,
}: {
  trades: Trade[];
  startingBalance: number;
}) {
  const router = useRouter();
  const strokeGradientId = useId();
  const fillGradientId = useId();
  const series = equitySeries(trades, startingBalance);
  const last = series.length ? series[series.length - 1].value : startingBalance;
  const positive = last >= startingBalance;
  const showBrush = series.length > 10;

  // Diverging color: green above the starting balance, red below, with a
  // hard transition exactly where the equity line crosses it — not just a
  // single color picked from the final value.
  const values = series.map((s) => s.value);
  const min = Math.min(startingBalance, ...values);
  const max = Math.max(startingBalance, ...values);
  const range = max - min;
  // Percentage from the chart's top (0%) down to the starting-balance line.
  const crossOffset = range > 0 ? Math.min(1, Math.max(0, (max - startingBalance) / range)) : 0;
  const crossPct = `${(crossOffset * 100).toFixed(2)}%`;

  const handleClick: CategoricalChartFunc = (state) => {
    const label = state?.activeLabel;
    if (typeof label === "string" && label !== "start") {
      router.push(`/analytics?date=${label}`);
    }
  };

  return (
    <Card padding="lg">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-medium text-muted">Equity curve</h3>
          </div>
          <p
            className="mt-1 text-2xl font-semibold tracking-tight tabular-nums"
            style={{ color: positive ? "var(--profit)" : "var(--loss)" }}
          >
            {formatCurrency(last)}
          </p>
        </div>
        <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
          {Math.max(0, series.length - 1)} day{series.length - 2 === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 h-52 w-full">
        {series.length <= 1 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            No closed trades yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
              onClick={handleClick}
            >
              <defs>
                <linearGradient id={strokeGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--profit)" />
                  <stop offset={crossPct} stopColor="var(--profit)" />
                  <stop offset={crossPct} stopColor="var(--loss)" />
                  <stop offset="100%" stopColor="var(--loss)" />
                </linearGradient>
                <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--profit)" stopOpacity={0.32} />
                  <stop offset={crossPct} stopColor="var(--profit)" stopOpacity={0} />
                  <stop offset={crossPct} stopColor="var(--loss)" stopOpacity={0} />
                  <stop offset="100%" stopColor="var(--loss)" stopOpacity={0.32} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis domain={[min, max]} hide />
              <Tooltip
                content={<EquityTooltip startingBalance={startingBalance} />}
                cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              />
              {range > 0 && (
                <ReferenceLine
                  y={startingBalance}
                  stroke="var(--chart-axis)"
                  strokeDasharray="3 3"
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                baseValue={startingBalance}
                stroke={`url(#${strokeGradientId})`}
                strokeWidth={2}
                fill={`url(#${fillGradientId})`}
                isAnimationActive
                animationDuration={600}
                activeDot={(dotProps: DotProps & { payload?: { value: number } }) => (
                  <EquityActiveDot {...dotProps} startingBalance={startingBalance} />
                )}
              />
              {showBrush && (
                <Brush
                  dataKey="date"
                  height={22}
                  stroke="var(--accent)"
                  fill="var(--surface-2)"
                  travellerWidth={8}
                  tickFormatter={() => ""}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
