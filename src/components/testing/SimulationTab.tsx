"use client";

import { useMemo, useState } from "react";
import { Dices, Percent, TrendingDown, Wallet } from "lucide-react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Card from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import type { BacktestTrade } from "@/lib/testing/types";
import { runMonteCarloSimulation } from "@/lib/testing/simulation";
import { formatCurrency, formatPercent } from "@/lib/utils";

function SimulationTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: { p10: number; p50: number; p90: number } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-muted">Trade {label}</div>
      <div className="tabular-nums text-accent">Median {formatCurrency(d.p50)}</div>
      <div className="tabular-nums text-muted">
        P10 {formatCurrency(d.p10)} · P90 {formatCurrency(d.p90)}
      </div>
    </div>
  );
}

export default function SimulationTab({
  trades,
  startingBalance,
}: {
  trades: BacktestTrade[];
  startingBalance: number;
}) {
  const [seed, setSeed] = useState(42);

  const result = useMemo(
    () => runMonteCarloSimulation(trades, startingBalance, { runs: 300, seed }),
    [trades, startingBalance, seed],
  );

  const chartData = useMemo(
    () => result?.series.map((p) => ({ ...p, band: p.p90 - p.p10 })) ?? [],
    [result],
  );

  // Recharts' "dataMin"/"dataMax" domain keywords scan every plotted
  // dataKey independently, including the small `band` deltas — which
  // badly skews the axis. Compute the real range from p10/p90 instead.
  const yDomain = useMemo((): [number, number] => {
    if (!result || result.series.length === 0) return [0, 1];
    const values = result.series.flatMap((p) => [p.p10, p.p90]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08 || Math.abs(max) * 0.02 || 1;
    return [min - pad, max + pad];
  }, [result]);

  if (!result) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={Dices}
          title="Not enough closed trades to simulate."
          description="Add or import at least one closed trade to run a Monte Carlo projection."
        />
      </Card>
    );
  }

  const { summary } = result;
  const profitPositive = summary.medianFinalBalance >= startingBalance;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Median final balance" icon={Wallet} accent={profitPositive ? "profit" : "loss"}>
          <div
            className="mt-2 text-xl font-semibold tabular-nums"
            style={{ color: profitPositive ? "var(--profit)" : "var(--loss)" }}
          >
            {formatCurrency(summary.medianFinalBalance)}
          </div>
          <p className="mt-1 text-xs text-muted">
            P10 {formatCurrency(summary.p10FinalBalance)} · P90 {formatCurrency(summary.p90FinalBalance)}
          </p>
        </StatTile>
        <StatTile label="Probability of profit" icon={Percent} accent="muted">
          <div className="mt-2 text-xl font-semibold tabular-nums">{formatPercent(summary.probabilityOfProfit, 0)}</div>
          <p className="mt-1 text-xs text-muted">across {summary.runs} simulated runs</p>
        </StatTile>
        <StatTile label="Median max drawdown" icon={TrendingDown} accent="muted">
          <div className="mt-2 text-xl font-semibold tabular-nums">{formatPercent(summary.medianMaxDrawdownPct, 1)}</div>
          <p className="mt-1 text-xs text-muted">typical worst dip</p>
        </StatTile>
        <StatTile label="Worst-case drawdown (P90)" icon={TrendingDown} accent="loss">
          <div className="mt-2 text-xl font-semibold tabular-nums text-loss">
            {formatPercent(summary.worstMaxDrawdownPct, 1)}
          </div>
          <p className="mt-1 text-xs text-muted">10% of runs were worse</p>
        </StatTile>
      </div>

      <Card padding="lg">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold">Monte Carlo projection</h3>
            <p className="mt-1 text-xs text-muted">
              {summary.runs} bootstrap-resampled runs of your {summary.trades} closed trades — shaded band is the
              10th–90th percentile, the line is the median path.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSeed(Date.now())}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2"
          >
            <Dices className="h-3.5 w-3.5" /> Re-run
          </button>
        </div>

        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="step" hide />
              <YAxis hide domain={yDomain} />
              <Tooltip content={<SimulationTooltip />} cursor={{ stroke: "var(--chart-axis)" }} />
              <ReferenceLine y={startingBalance} stroke="var(--chart-axis)" strokeDasharray="3 3" />
              <Area dataKey="p10" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
              <Area
                dataKey="band"
                stackId="band"
                stroke="none"
                fill="var(--accent)"
                fillOpacity={0.16}
                isAnimationActive
                animationDuration={500}
              />
              <Line dataKey="p50" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive animationDuration={500} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
