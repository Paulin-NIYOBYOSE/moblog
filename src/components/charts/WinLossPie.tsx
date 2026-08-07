"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatPercent } from "@/lib/utils";

export default function WinLossPie({
  wins,
  losses,
  breakeven = 0,
  winRate,
}: {
  wins: number;
  losses: number;
  breakeven?: number;
  winRate: number;
}) {
  const total = wins + losses + breakeven;
  const data = total > 0
    ? [
        { name: "Wins", value: wins, color: "var(--profit)" },
        { name: "Losses", value: losses, color: "var(--loss)" },
        ...(breakeven > 0 ? [{ name: "Break-even", value: breakeven, color: "var(--muted)" }] : []),
      ]
    : [{ name: "Empty", value: 1, color: "var(--border)" }];

  return (
    <div className="relative h-24 w-24 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="72%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive
            animationDuration={600}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums">{formatPercent(winRate, 0)}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted">win</span>
      </div>
    </div>
  );
}
