"use client";

import {
  Activity,
  Gauge,
  Percent,
  Scale,
  Wallet,
  TrendingUp,
  Target,
} from "lucide-react";
import type { Stats } from "@/lib/types";
import { cn, formatCurrency, formatPercent, formatSignedCurrency, formatR, formatSignedPercent } from "@/lib/utils";

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
  children,
}: {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      {children}
    </div>
  );
}

export default function StatCards({ stats }: { stats: Stats }) {
  const pnlPositive = stats.netPnl >= 0;
  const profitFactorDisplay = stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-7">
      <Card label="Balance" icon={Wallet}>
        <div className="mt-2 text-xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(stats.currentBalance)}
        </div>
        <p className="mt-1 text-xs text-muted">
          {formatSignedCurrency(stats.netPnl)} · {formatSignedPercent(stats.returnPct)}
        </p>
      </Card>

      <Card label="Net P&L" icon={TrendingUp}>
        <div className={cn("mt-2 text-xl font-semibold tracking-tight tabular-nums", pnlPositive ? "text-profit" : "text-loss")}>
          {formatSignedCurrency(stats.netPnl)}
        </div>
        <p className="mt-1 text-xs text-muted">{stats.closedTrades} closed</p>
      </Card>

      <Card label="Win rate" icon={Percent}>
        <div className="mt-2 text-xl font-semibold tracking-tight tabular-nums">
          {formatPercent(stats.winRate)}
        </div>
        <WinRateBar wins={stats.wins} losses={stats.losses} />
      </Card>

      <Card label="Profit factor" icon={Gauge}>
        <div className="mt-2 text-xl font-semibold tracking-tight tabular-nums">{profitFactorDisplay}</div>
        <p className="mt-1 text-xs text-muted">{stats.wins}W · {stats.losses}L</p>
      </Card>

      <Card label="Avg R:R" icon={Target}>
        <div className="mt-2 text-xl font-semibold tracking-tight tabular-nums">{formatR(stats.avgRr)}</div>
        <p className="mt-1 text-xs text-muted">total {formatR(stats.totalR)}</p>
      </Card>

      <Card label="Avg win / loss" icon={Scale}>
        <div className="mt-2 flex items-baseline gap-1.5 text-lg font-semibold tracking-tight tabular-nums">
          <span className="text-profit">{formatCurrency(stats.avgWin)}</span>
          <span className="text-muted text-sm font-normal">/</span>
          <span className="text-loss">{formatCurrency(stats.avgLoss)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">per trade</p>
      </Card>

      <Card label="Expectancy" icon={Activity}>
        <div className={cn("mt-2 text-xl font-semibold tracking-tight tabular-nums", stats.expectancy >= 0 ? "text-profit" : "text-loss")}>
          {formatSignedCurrency(stats.expectancy)}
        </div>
        <p className="mt-1 text-xs text-muted">avg per trade</p>
      </Card>
    </div>
  );
}
