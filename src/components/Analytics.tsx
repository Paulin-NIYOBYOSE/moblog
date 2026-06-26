"use client";

import type { Stats, Trade } from "@/lib/types";
import { formatCurrency, formatR, formatSignedCurrency, formatPercent } from "@/lib/utils";

function Donut({ winRate }: { winRate: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (winRate / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--loss)" strokeWidth="9" opacity="0.85" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--profit)" strokeWidth="9" strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums">{formatPercent(winRate, 0)}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted">win</span>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "profit" | "loss" }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums" style={tone ? { color: tone === "profit" ? "var(--profit)" : "var(--loss)" } : undefined}>{value}</span>
    </div>
  );
}

function topSetups(trades: Trade[]) {
  const map = new Map<string, { pnl: number; count: number }>();
  for (const t of trades) {
    if (!t.setup) continue;
    const e = map.get(t.setup) ?? { pnl: 0, count: 0 };
    e.pnl += t.pnl;
    e.count += 1;
    map.set(t.setup, e);
  }
  return Array.from(map.entries())
    .map(([setup, v]) => ({ setup, ...v }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 4);
}

export default function Analytics({ stats, trades }: { stats: Stats; trades: Trade[] }) {
  const setups = topSetups(trades);
  const maxAbs = Math.max(1, ...setups.map((s) => Math.abs(s.pnl)));

  return (
    <div id="analytics" className="rounded-2xl border border-border bg-card p-5 scroll-mt-20">
      <h3 className="text-sm font-semibold">Performance breakdown</h3>

      <div className="mt-4 flex items-center gap-5">
        <Donut winRate={stats.winRate} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-4 text-sm">
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
          </div>
          <div className="mt-2 divide-y divide-border">
            <Row label="Best streak" value={`${stats.maxWinStreak} wins`} tone="profit" />
            <Row label="Worst streak" value={`${stats.maxLossStreak} losses`} tone="loss" />
            <Row label="Best day" value={formatSignedCurrency(stats.bestDay)} tone="profit" />
            <Row label="Worst day" value={formatSignedCurrency(stats.worstDay)} tone="loss" />
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Top setups</p>
        {setups.length === 0 ? (
          <p className="py-3 text-sm text-muted">Add a setup tag to your trades to see what works best.</p>
        ) : (
          <div className="space-y-2.5">
            {setups.map((s) => {
              const positive = s.pnl >= 0;
              const width = (Math.abs(s.pnl) / maxAbs) * 100;
              return (
                <div key={s.setup}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{s.setup}</span>
                    <span className="tabular-nums" style={{ color: positive ? "var(--profit)" : "var(--loss)" }}>
                      {formatSignedCurrency(s.pnl)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${width}%`, background: positive ? "var(--profit)" : "var(--loss)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Exit logic</p>
        <ExitLogicBreakdown trades={trades} />
      </div>
    </div>
  );
}

function ExitLogicBreakdown({ trades }: { trades: Trade[] }) {
  const map = new Map<string, { pnl: number; count: number }>();
  for (const t of trades) {
    const key = t.exitLogic || "Other";
    const e = map.get(key) ?? { pnl: 0, count: 0 };
    e.pnl += t.pnl;
    e.count += 1;
    map.set(key, e);
  }
  const items = Array.from(map.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  if (items.length === 0) return <p className="py-2 text-sm text-muted">No exit logic recorded yet.</p>;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.label} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted">{i.label}</span>
          <span className="font-medium tabular-nums" style={{ color: i.pnl >= 0 ? "var(--profit)" : "var(--loss)" }}>
            {formatSignedCurrency(i.pnl)} · {i.count}
          </span>
        </div>
      ))}
    </div>
  );
}
