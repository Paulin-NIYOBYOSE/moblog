"use client";

import type { Stats } from "@/lib/types";
import { formatSignedCurrency } from "@/lib/utils";
import Card from "./ui/Card";
import WinLossPie from "./charts/WinLossPie";

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss";
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span
        className="font-medium tabular-nums"
        style={
          tone
            ? { color: tone === "profit" ? "var(--profit)" : "var(--loss)" }
            : undefined
        }
      >
        {value}
      </span>
    </div>
  );
}

export default function Analytics({ stats }: { stats: Stats }) {
  return (
    <Card id="analytics" scrollMt padding="lg">
      <h3 className="text-sm font-semibold">Performance breakdown</h3>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
        <WinLossPie
          wins={stats.wins}
          losses={stats.losses}
          breakeven={stats.breakeven}
          winRate={stats.winRate}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-profit" />
              <span className="text-muted">Wins</span>
              <span className="font-medium tabular-nums">{stats.wins}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-loss" />
              <span className="text-muted">Losses</span>
              <span className="font-medium tabular-nums">{stats.losses}</span>
            </div>
            {stats.breakeven > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                <span className="text-muted">Break-even</span>
                <span className="font-medium tabular-nums">
                  {stats.breakeven}
                </span>
              </div>
            )}
          </div>
          <div className="mt-2 divide-y divide-border">
            <Row
              label="Best streak"
              value={`${stats.maxWinStreak} wins`}
              tone="profit"
            />
            <Row
              label="Worst streak"
              value={`${stats.maxLossStreak} losses`}
              tone="loss"
            />
            <Row
              label="Best day"
              value={formatSignedCurrency(stats.bestDay)}
              tone="profit"
            />
            <Row
              label="Worst day"
              value={formatSignedCurrency(stats.worstDay)}
              tone="loss"
            />
            <Row
              label="Avg per trade"
              value={formatSignedCurrency(stats.avgPerTrade)}
              tone={stats.avgPerTrade >= 0 ? "profit" : "loss"}
            />
            <Row
              label="Expectancy"
              value={formatSignedCurrency(stats.expectancy)}
              tone={stats.expectancy >= 0 ? "profit" : "loss"}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
