"use client";

import {
  Activity,
  Gauge,
  Percent,
  Scale,
  Sparkles,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Stats, Trade } from "@/lib/types";
import {
  cn,
  formatCurrency,
  formatPercent,
  formatR,
  formatSignedCurrency,
  formatSignedPercent,
} from "@/lib/utils";
import { computeConsistencyScore, computeDrawdown, computeTradeDurations } from "@/lib/analytics";
import StatTile from "./ui/StatTile";

function WinRateBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  const winPct = total ? (wins / total) * 100 : 0;
  return (
    <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-border">
      <div className="h-full bg-profit transition-all duration-500" style={{ width: `${winPct}%` }} />
      <div className="h-full bg-loss transition-all duration-500" style={{ width: `${100 - winPct}%` }} />
    </div>
  );
}

export default function StatCards({
  stats,
  trades,
  startingBalance,
}: {
  stats: Stats;
  trades: Trade[];
  startingBalance: number;
}) {
  const pnlPositive = stats.netPnl >= 0;
  const profitFactorDisplay =
    stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2);

  const drawdown = computeDrawdown(trades, startingBalance);
  const duration = computeTradeDurations(trades);
  const consistency = computeConsistencyScore(trades);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10">
      <StatTile label="Balance" icon={Wallet} accent="muted">
        <div className="mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(stats.currentBalance)}
        </div>
        <p className="mt-1 flex min-w-0 gap-1 truncate text-xs text-muted">
          <span className={pnlPositive ? "text-profit" : "text-loss"}>
            {formatSignedCurrency(stats.netPnl)}
          </span>
          <span>·</span>
          <span>{formatSignedPercent(stats.returnPct)}</span>
        </p>
      </StatTile>

      <StatTile label="Net P&L" icon={TrendingUp} accent={pnlPositive ? "profit" : "loss"}>
        <div
          className={cn(
            "mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums",
            pnlPositive ? "text-profit" : "text-loss",
          )}
        >
          {formatSignedCurrency(stats.netPnl)}
        </div>
        <p className="mt-1 truncate text-xs text-muted">{stats.closedTrades} closed</p>
      </StatTile>

      <StatTile label="Win rate" icon={Percent} accent="muted">
        <div className="mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums">
          {formatPercent(stats.winRate)}
        </div>
        <WinRateBar wins={stats.wins} losses={stats.losses} />
      </StatTile>

      <StatTile label="Profit factor" icon={Gauge} accent="muted">
        <div className="mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums">
          {profitFactorDisplay}
        </div>
        <p className="mt-1 truncate text-xs text-muted">
          {stats.wins}W · {stats.losses}L
        </p>
      </StatTile>

      <StatTile label="Avg R:R" icon={Target} accent="muted">
        <div className="mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums">
          {formatR(stats.avgRr)}
        </div>
        <p className="mt-1 truncate text-xs text-muted">total {formatR(stats.totalR)}</p>
      </StatTile>

      <StatTile label="Avg win / loss" icon={Scale} accent="muted">
        <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-1 text-base font-semibold tracking-tight tabular-nums">
          <span className="text-profit">{formatCurrency(stats.avgWin)}</span>
          <span className="text-xs font-normal text-muted">/</span>
          <span className="text-loss">{formatCurrency(stats.avgLoss)}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted">per trade</p>
      </StatTile>

      <StatTile label="Expectancy" icon={Activity} accent={stats.expectancy >= 0 ? "profit" : "loss"}>
        <div
          className={cn(
            "mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums",
            stats.expectancy >= 0 ? "text-profit" : "text-loss",
          )}
        >
          {formatSignedCurrency(stats.expectancy)}
        </div>
        <p className="mt-1 truncate text-xs text-muted">avg per trade</p>
      </StatTile>

      <StatTile label="Max drawdown" icon={TrendingDown} accent={drawdown.maxDrawdown > 0 ? "loss" : "muted"}>
        <div className="mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums text-loss">
          {formatCurrency(drawdown.maxDrawdown)}
        </div>
        <p className="mt-1 truncate text-xs text-muted">{drawdown.maxDrawdownPct.toFixed(1)}% from peak</p>
      </StatTile>

      <StatTile label="Avg duration" icon={Timer} accent="muted">
        <div className="mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums">
          {duration.avgDurationLabel}
        </div>
        <p className="mt-1 truncate text-xs text-muted">{duration.count} closed trades</p>
      </StatTile>

      <StatTile
        label="Consistency"
        icon={Sparkles}
        accent={consistency.score >= 60 ? "profit" : consistency.score >= 30 ? "warning" : "loss"}
      >
        <div className="mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums">
          {Math.round(consistency.score)}
          <span className="text-sm font-normal text-muted">/100</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted">
          {formatPercent(consistency.profitableDaysPct, 0)} profitable days
        </p>
      </StatTile>
    </div>
  );
}
