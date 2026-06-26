"use client";

import {
  Activity,
  Gauge,
  Percent,
  Scale,
  Wallet,
  TrendingUp,
  Target,
  BarChart2,
} from "lucide-react";
import type { Stats } from "@/lib/types";
import {
  cn,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatR,
  formatSignedPercent,
} from "@/lib/utils";

function WinRateBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  const winPct = total ? (wins / total) * 100 : 0;
  return (
    <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-border">
      <div className="h-full bg-profit" style={{ width: `${winPct}%` }} />
      <div className="h-full bg-loss" style={{ width: `${100 - winPct}%` }} />
    </div>
  );
}

function Card({
  label,
  icon: Icon,
  accent,
  children,
}: {
  label: string;
  icon: React.ElementType;
  accent?: "profit" | "loss" | "muted";
  children: React.ReactNode;
}) {
  const accentClass =
    accent === "profit"
      ? "text-profit"
      : accent === "loss"
      ? "text-loss"
      : "text-muted";

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:border-border/80 hover:shadow-md sm:p-5">
      <div className="absolute right-0 top-0 h-24 w-24 -translate-y-1/2 translate-x-1/2 rounded-full bg-accent/5 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium uppercase tracking-wide text-muted">
            {label}
          </span>
          <Icon className={cn("h-4 w-4 shrink-0", accentClass)} />
        </div>
        {children}
      </div>
    </div>
  );
}

export default function StatCards({ stats }: { stats: Stats }) {
  const pnlPositive = stats.netPnl >= 0;
  const profitFactorDisplay =
    stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
      <Card label="Balance" icon={Wallet} accent="muted">
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
      </Card>

      <Card label="Net P&L" icon={TrendingUp} accent={pnlPositive ? "profit" : "loss"}>
        <div
          className={cn(
            "mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums",
            pnlPositive ? "text-profit" : "text-loss",
          )}
        >
          {formatSignedCurrency(stats.netPnl)}
        </div>
        <p className="mt-1 truncate text-xs text-muted">{stats.closedTrades} closed</p>
      </Card>

      <Card label="Win rate" icon={Percent} accent="muted">
        <div className="mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums">
          {formatPercent(stats.winRate)}
        </div>
        <WinRateBar wins={stats.wins} losses={stats.losses} />
      </Card>

      <Card label="Profit factor" icon={Gauge} accent="muted">
        <div className="mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums">
          {profitFactorDisplay}
        </div>
        <p className="mt-1 truncate text-xs text-muted">
          {stats.wins}W · {stats.losses}L
        </p>
      </Card>

      <Card label="Avg R:R" icon={Target} accent="muted">
        <div className="mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums">
          {formatR(stats.avgRr)}
        </div>
        <p className="mt-1 truncate text-xs text-muted">total {formatR(stats.totalR)}</p>
      </Card>

      <Card label="Avg win / loss" icon={Scale} accent="muted">
        <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-1 text-base font-semibold tracking-tight tabular-nums">
          <span className="text-profit">{formatCurrency(stats.avgWin)}</span>
          <span className="text-xs font-normal text-muted">/</span>
          <span className="text-loss">{formatCurrency(stats.avgLoss)}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted">per trade</p>
      </Card>

      <Card label="Expectancy" icon={Activity} accent={stats.expectancy >= 0 ? "profit" : "loss"}>
        <div
          className={cn(
            "mt-2 min-w-0 truncate text-xl font-semibold tracking-tight tabular-nums",
            stats.expectancy >= 0 ? "text-profit" : "text-loss",
          )}
        >
          {formatSignedCurrency(stats.expectancy)}
        </div>
        <p className="mt-1 truncate text-xs text-muted">avg per trade</p>
      </Card>
    </div>
  );
}
