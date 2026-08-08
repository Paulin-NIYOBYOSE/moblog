"use client";

import { useId, useMemo, useState } from "react";
import { Home, Minus, Plus } from "lucide-react";
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
import Card from "@/components/ui/Card";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { BacktestTrade } from "@/lib/testing/types";
import { computeStats, equitySeries, equitySeriesPerTrade } from "@/lib/testing/stats";
import { formatCurrency, formatPercent, formatSignedCurrency, formatSignedPercent } from "@/lib/utils";

type Granularity = "ALL" | "DAY" | "1H" | "15M";

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums tracking-tight">{value}</span>
        {sub}
      </div>
    </div>
  );
}

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
      <div className="font-semibold tabular-nums" style={{ color: positive ? "var(--profit)" : "var(--loss)" }}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

export default function TestingPnlCard({
  trades,
  startingBalance,
  breakevenThreshold,
  onBreakevenThresholdChange,
}: {
  trades: BacktestTrade[];
  startingBalance: number;
  breakevenThreshold: number;
  onBreakevenThresholdChange: (value: number) => void;
}) {
  const [granularity, setGranularity] = useState<Granularity>("ALL");
  const [thresholdDraft, setThresholdDraft] = useState(String(breakevenThreshold));
  const [zoomKey, setZoomKey] = useState(0);
  const [range, setRange] = useState<{ startIndex?: number; endIndex?: number }>({});
  const strokeGradientId = useId();
  const fillGradientId = useId();

  const stats = useMemo(
    () => computeStats(trades, startingBalance, breakevenThreshold),
    [trades, startingBalance, breakevenThreshold],
  );

  const series = useMemo(() => {
    return granularity === "DAY" ? equitySeries(trades, startingBalance) : equitySeriesPerTrade(trades, startingBalance);
  }, [trades, startingBalance, granularity]);

  const values = series.map((s) => s.value);
  const min = values.length ? Math.min(startingBalance, ...values) : startingBalance;
  const max = values.length ? Math.max(startingBalance, ...values) : startingBalance;
  const range_ = max - min;
  const crossOffset = range_ > 0 ? Math.min(1, Math.max(0, (max - startingBalance) / range_)) : 0;
  const crossPct = `${(crossOffset * 100).toFixed(2)}%`;
  const pnlPositive = stats.netPnl >= 0;

  function zoom(factor: number) {
    const len = series.length;
    if (len < 4) return;
    const start = range.startIndex ?? 0;
    const end = range.endIndex ?? len - 1;
    const mid = (start + end) / 2;
    const halfWidth = Math.max(1, ((end - start) * factor) / 2);
    const newStart = Math.max(0, Math.round(mid - halfWidth));
    const newEnd = Math.min(len - 1, Math.round(mid + halfWidth));
    if (newEnd - newStart < 2) return;
    setRange({ startIndex: newStart, endIndex: newEnd });
    setZoomKey((k) => k + 1);
  }

  function resetZoom() {
    setRange({});
    setZoomKey((k) => k + 1);
  }

  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">Profit and loss</h3>
        <SegmentedControl
          value={granularity}
          onChange={setGranularity}
          options={[
            { value: "ALL", label: "All" },
            { value: "DAY", label: "Day" },
            { value: "1H", label: "1 Hour" },
            { value: "15M", label: "15 Min" },
          ]}
        />
      </div>
      {(granularity === "1H" || granularity === "15M") && (
        <p className="mt-1 text-[11px] text-muted">
          Limited by available trade timestamps — showing per-trade granularity.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Total P&L"
          value={<span className={pnlPositive ? "text-profit" : "text-loss"}>{formatSignedCurrency(stats.netPnl)}</span>}
          sub={
            <span className={`text-xs ${pnlPositive ? "text-profit" : "text-loss"}`}>
              {formatSignedPercent(stats.returnPct)}
            </span>
          }
        />
        <Stat
          label="Account Balance"
          value={formatCurrency(stats.currentBalance)}
          sub={
            <span className={`text-xs ${pnlPositive ? "text-profit" : "text-loss"}`}>
              {formatSignedPercent(stats.returnPct)}
            </span>
          }
        />
        <Stat label="Win Rate" value={formatPercent(stats.winRate, 0)} />
        <Stat
          label="Total Trades"
          value={stats.totalTrades}
          sub={<span className="text-xs text-muted">{stats.wins}/{stats.losses}</span>}
        />
        <Stat label="Breakeven Trades" value={stats.breakeven} />
        <div>
          <p className="text-xs text-muted">Breakeven Threshold</p>
          <form
            className="mt-1 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(thresholdDraft);
              onBreakevenThresholdChange(Number.isFinite(n) ? Math.max(0, n) : 0);
            }}
          >
            <input
              type="number"
              min={0}
              step="any"
              value={thresholdDraft}
              onChange={(e) => setThresholdDraft(e.target.value)}
              className="input w-20 py-1 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-border disabled:opacity-50"
              disabled={Number(thresholdDraft) === breakevenThreshold}
            >
              Submit
            </button>
          </form>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => zoom(0.6)}
          title="Zoom in"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => zoom(1.6)}
          title="Zoom out"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={resetZoom}
          title="Reset zoom"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 h-64 w-full">
        {series.length <= 1 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">No closed trades yet</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
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
              <Tooltip content={<EquityTooltip startingBalance={startingBalance} />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} />
              {range_ > 0 && <ReferenceLine y={startingBalance} stroke="var(--chart-axis)" strokeDasharray="3 3" />}
              <Area
                type="monotone"
                dataKey="value"
                baseValue={startingBalance}
                stroke={`url(#${strokeGradientId})`}
                strokeWidth={2}
                fill={`url(#${fillGradientId})`}
                isAnimationActive
                animationDuration={500}
              />
              <Brush
                key={zoomKey}
                dataKey="date"
                height={22}
                stroke="var(--accent)"
                fill="var(--surface-2)"
                travellerWidth={8}
                startIndex={range.startIndex}
                endIndex={range.endIndex}
                onChange={(r) => setRange({ startIndex: r.startIndex, endIndex: r.endIndex })}
                tickFormatter={() => ""}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
