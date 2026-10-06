"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  Clock,
  Gem,
  Layers,
  LineChart as LineIcon,
  Scale,
  Sigma,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Card, { CardHeader } from "@/components/ui/Card";
import SegmentedControl from "@/components/ui/SegmentedControl";
import YearHeatmap, { type HeatCell } from "@/components/charts/YearHeatmap";
import {
  AXIS_STROKE,
  AXIS_TICK,
  axisMoney,
  BAR_MAX,
  BAR_RADIUS,
  ChartEmpty,
  ChartTooltipBox,
  GRID_STROKE,
  InlineBar,
  pnlColor,
  ProgressRing,
  RatioBar,
  SemiGauge,
} from "@/components/charts/kit";
import {
  aggregateByYear,
  breakdownByField,
  dailyPnlSeries,
  dayWinStats,
  directionSplit,
  edgeScore,
  holdingTimeBreakdown,
  monthSeasonality,
  pnlDistribution,
} from "@/lib/analytics";
import type { Stats, Trade } from "@/lib/types";
import { aggregateByDay, cn, formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/utils";

const signed = (v: number) => formatSignedCurrency(v, { compact: true });

// ---------------------------------------------------------------------------
// KPI hero
// ---------------------------------------------------------------------------

function KpiCard({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:-translate-y-px hover:shadow-md sm:p-5", className)}>
      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      {children}
    </div>
  );
}

export function KpiHero({ stats, trades }: { stats: Stats; trades: Trade[] }) {
  const days = useMemo(() => dayWinStats(trades), [trades]);
  const series = useMemo(() => dailyPnlSeries(trades), [trades]);
  const pf = stats.profitFactor;
  const ratio = stats.avgLoss ? stats.avgWin / stats.avgLoss : 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <KpiCard label="Net P&L" className="col-span-2 lg:col-span-1">
        <div className={cn("mt-2 text-[1.9rem] font-semibold leading-none tracking-tight", stats.netPnl > 0 ? "text-profit" : stats.netPnl < 0 ? "text-loss" : "")}>
          {formatSignedCurrency(stats.netPnl)}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {stats.closedTrades} closed trades · {formatPercent(stats.returnPct, 2)} return
        </p>
        {series.length > 1 && (
          <div className="mt-2 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <Area type="monotone" dataKey="cum" stroke={stats.netPnl >= 0 ? "var(--profit)" : "var(--loss)"} strokeWidth={1.5} fill={stats.netPnl >= 0 ? "var(--profit)" : "var(--loss)"} fillOpacity={0.1} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </KpiCard>

      <KpiCard label="Trade win %">
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-semibold tracking-tight">{formatPercent(stats.winRate)}</div>
            <div className="mt-1 text-[11px] text-muted">
              <span className="text-profit">{stats.wins}W</span> · {stats.breakeven}BE · <span className="text-loss">{stats.losses}L</span>
            </div>
          </div>
          <SemiGauge
            size={74}
            stroke={7}
            segments={[
              { value: stats.wins, color: "var(--profit)" },
              { value: stats.breakeven, color: "var(--faint)" },
              { value: stats.losses, color: "var(--loss)" },
            ]}
          />
        </div>
      </KpiCard>

      <KpiCard label="Profit factor">
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-semibold tracking-tight">{pf === Infinity ? "∞" : pf.toFixed(2)}</div>
            <div className="mt-1 text-[11px] text-muted">{pf >= 2 ? "Excellent" : pf >= 1.5 ? "Strong" : pf >= 1 ? "Profitable" : "Below break-even"}</div>
          </div>
          <ProgressRing percent={Math.min(100, ((Number.isFinite(pf) ? pf : 3) / 3) * 100)} size={52} stroke={6} color={pf >= 1 ? "var(--profit)" : "var(--loss)"} />
        </div>
      </KpiCard>

      <KpiCard label="Day win %">
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-semibold tracking-tight">{formatPercent(days.pct)}</div>
            <div className="mt-1 text-[11px] text-muted">
              <span className="text-profit">{days.green} green</span> · <span className="text-loss">{days.red} red</span>
            </div>
          </div>
          <SemiGauge
            size={74}
            stroke={7}
            segments={[
              { value: days.green, color: "var(--profit)" },
              { value: days.flat, color: "var(--faint)" },
              { value: days.red, color: "var(--loss)" },
            ]}
          />
        </div>
      </KpiCard>

      <KpiCard label="Avg win / loss">
        <div className="mt-2 text-2xl font-semibold tracking-tight">{ratio ? ratio.toFixed(2) : "—"}</div>
        <div className="mt-2.5">
          <RatioBar a={stats.avgWin} b={stats.avgLoss} />
          <div className="mt-1.5 flex justify-between text-[11px] font-medium">
            <span className="text-profit">{formatCurrency(stats.avgWin)}</span>
            <span className="text-loss">-{formatCurrency(stats.avgLoss)}</span>
          </div>
        </div>
      </KpiCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge score radar
// ---------------------------------------------------------------------------

export function EdgeScoreCard({ trades, startingBalance }: { trades: Trade[]; startingBalance: number }) {
  const { score, axes } = useMemo(() => edgeScore(trades, startingBalance), [trades, startingBalance]);
  const tone = score >= 70 ? "var(--profit)" : score >= 45 ? "var(--accent)" : "var(--loss)";
  return (
    <Card padding="lg" className="flex flex-col">
      <CardHeader icon={Gem} tone="gold" title="Edge score" subtitle="Six normalized pillars of a durable edge" />
      {trades.filter((t) => t.closeDate).length === 0 ? (
        <ChartEmpty className="h-64">No closed trades in this view.</ChartEmpty>
      ) : (
        <>
          <div className="relative h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={axes} outerRadius="72%">
                <PolarGrid stroke={GRID_STROKE} />
                <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--muted)", fontSize: 10.5 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof axes)[number];
                    return <ChartTooltipBox title={d.axis} rows={[{ label: "Value", value: d.raw }, { label: "Score", value: `${Math.round(d.value)}/100` }]} />;
                  }}
                />
                <Radar dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.14} isAnimationActive animationDuration={600} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4">
            <div>
              <div className="eyebrow">Your score</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight">
                {Math.round(score)}
                <span className="text-base font-normal text-muted">/100</span>
              </div>
            </div>
            <div className="w-1/2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: tone }} />
              </div>
              <div className="mt-1.5 text-right text-[11px] text-muted">{score >= 70 ? "Elite consistency" : score >= 45 ? "Solid foundation" : "Room to tighten"}</div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cumulative / daily P&L
// ---------------------------------------------------------------------------

export function PnlTimeline({ trades, onSelectDay }: { trades: Trade[]; onSelectDay?: (day: string) => void }) {
  const [mode, setMode] = useState<"cumulative" | "daily">("cumulative");
  const series = useMemo(() => dailyPnlSeries(trades), [trades]);
  const last = series.at(-1)?.cum ?? 0;
  const values = series.map((s) => s.cum);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const zero = max - min > 0 ? `${((max / (max - min)) * 100).toFixed(2)}%` : "100%";

  return (
    <Card padding="lg">
      <CardHeader
        icon={LineIcon}
        title={mode === "cumulative" ? "Daily net cumulative P&L" : "Net daily P&L"}
        subtitle={`${series.length} trading day${series.length === 1 ? "" : "s"} · click a day for details`}
        action={
          <div className="flex items-center gap-3">
            <span className={cn("hidden text-sm font-semibold sm:inline", last >= 0 ? "text-profit" : "text-loss")}>{formatSignedCurrency(last)}</span>
            <SegmentedControl
              options={[
                { value: "cumulative", label: "Cumulative" },
                { value: "daily", label: "Daily" },
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>
        }
      />
      {series.length === 0 ? (
        <ChartEmpty className="h-64">No closed trades in this view.</ChartEmpty>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {mode === "cumulative" ? (
              <AreaChart
                data={series}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                onClick={(s) => {
                  const i = s?.activeIndex;
                  if (typeof i === "number" && series[i]) onSelectDay?.(series[i].date);
                }}
              >
                <defs>
                  <linearGradient id="cumStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--profit)" />
                    <stop offset={zero} stopColor="var(--profit)" />
                    <stop offset={zero} stopColor="var(--loss)" />
                    <stop offset="100%" stopColor="var(--loss)" />
                  </linearGradient>
                  <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--profit)" stopOpacity={0.22} />
                    <stop offset={zero} stopColor="var(--profit)" stopOpacity={0.03} />
                    <stop offset={zero} stopColor="var(--loss)" stopOpacity={0.03} />
                    <stop offset="100%" stopColor="var(--loss)" stopOpacity={0.22} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: AXIS_STROKE }} tickLine={false} minTickGap={32} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} tickFormatter={axisMoney} />
                <ReferenceLine y={0} stroke={AXIS_STROKE} />
                <Tooltip
                  cursor={{ stroke: AXIS_STROKE }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof series)[number];
                    return (
                      <ChartTooltipBox
                        title={new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        rows={[
                          { label: "Cumulative", value: formatSignedCurrency(d.cum), tone: d.cum >= 0 ? "profit" : "loss" },
                          { label: "Day", value: formatSignedCurrency(d.pnl), tone: d.pnl >= 0 ? "profit" : "loss" },
                          { label: "Trades", value: d.trades },
                        ]}
                      />
                    );
                  }}
                />
                <Area type="monotone" dataKey="cum" baseValue={0} stroke="url(#cumStroke)" strokeWidth={2} fill="url(#cumFill)" isAnimationActive animationDuration={600} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2, fill: "var(--foreground)" }} />
              </AreaChart>
            ) : (
              <BarChart
                data={series}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                onClick={(s) => {
                  const i = s?.activeIndex;
                  if (typeof i === "number" && series[i]) onSelectDay?.(series[i].date);
                }}
              >
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: AXIS_STROKE }} tickLine={false} minTickGap={32} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} tickFormatter={axisMoney} />
                <ReferenceLine y={0} stroke={AXIS_STROKE} />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof series)[number];
                    return (
                      <ChartTooltipBox
                        title={new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        rows={[
                          { label: "Day P&L", value: formatSignedCurrency(d.pnl), tone: d.pnl >= 0 ? "profit" : "loss" },
                          { label: "Trades", value: d.trades },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="pnl" maxBarSize={BAR_MAX} radius={BAR_RADIUS} className="cursor-pointer">
                  {series.map((d) => (
                    <Cell key={d.date} fill={pnlColor(d.pnl)} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Year in trading
// ---------------------------------------------------------------------------

export function YearInTrading({ trades, onSelectDay }: { trades: Trade[]; onSelectDay?: (day: string) => void }) {
  const years = useMemo(() => {
    const set = new Set(aggregateByDay(trades).map((d) => Number(d.date.slice(0, 4))));
    if (!set.size) set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [trades]);
  const [picked, setPicked] = useState<number | null>(null);
  const year = picked && years.includes(picked) ? picked : years[0];
  const cells = useMemo(() => {
    const map = new Map<string, HeatCell>();
    for (const d of aggregateByDay(trades)) {
      map.set(d.date, {
        value: d.pnl,
        lines: [`${formatSignedCurrency(d.pnl)}`, `${d.trades} trade${d.trades === 1 ? "" : "s"} · ${d.trades ? Math.round((d.wins / d.trades) * 100) : 0}% win`],
      });
    }
    return map;
  }, [trades]);
  const yearDays = aggregateByDay(trades).filter((d) => d.date.startsWith(String(year)));
  const yearPnl = yearDays.reduce((s, d) => s + d.pnl, 0);

  return (
    <Card padding="lg">
      <CardHeader
        icon={CalendarDays}
        title="Year in trading"
        subtitle={`${yearDays.length} trading days · ${formatSignedCurrency(yearPnl)} in ${year}`}
        action={<SegmentedControl options={years.map((y) => ({ value: String(y), label: String(y) }))} value={String(year)} onChange={(v) => setPicked(Number(v))} />}
      />
      <YearHeatmap year={year} cells={cells} onSelect={onSelectDay} />
    </Card>
  );
}

export function YearlyDistribution({ trades }: { trades: Trade[] }) {
  const [mode, setMode] = useState<"year" | "season">("year");
  const yearly = useMemo(() => aggregateByYear(trades), [trades]);
  const season = useMemo(() => monthSeasonality(trades), [trades]);
  const data = mode === "year" ? yearly.map((y) => ({ label: y.year, value: y.pnl, n: y.trades, wins: y.wins })) : season.map((s) => ({ label: s.month, value: s.avgPnl, n: s.trades, wins: s.years }));

  return (
    <Card padding="lg">
      <CardHeader
        icon={CalendarRange}
        title={mode === "year" ? "Yearly distribution" : "Seasonality"}
        subtitle={mode === "year" ? "Net P&L per calendar year" : "Average P&L per calendar month, across years"}
        action={
          <SegmentedControl
            options={[
              { value: "year", label: "By year" },
              { value: "season", label: "By month" },
            ]}
            value={mode}
            onChange={setMode}
          />
        }
      />
      {data.every((d) => d.n === 0) ? (
        <ChartEmpty className="h-56">No closed trades in this view.</ChartEmpty>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: AXIS_STROKE }} tickLine={false} interval={0} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} tickFormatter={axisMoney} />
              <ReferenceLine y={0} stroke={AXIS_STROKE} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return (
                    <ChartTooltipBox
                      title={d.label}
                      rows={
                        mode === "year"
                          ? [
                              { label: "Net P&L", value: formatSignedCurrency(d.value), tone: d.value >= 0 ? "profit" : "loss" },
                              { label: "Trades", value: d.n },
                              { label: "Win rate", value: d.n ? `${Math.round((d.wins / d.n) * 100)}%` : "—" },
                            ]
                          : [
                              { label: "Avg P&L", value: formatSignedCurrency(d.value), tone: d.value >= 0 ? "profit" : "loss" },
                              { label: "Years traded", value: d.wins },
                              { label: "Trades", value: d.n },
                            ]
                      }
                    />
                  );
                }}
              />
              <Bar dataKey="value" maxBarSize={mode === "year" ? 48 : BAR_MAX} radius={BAR_RADIUS}>
                {data.map((d) => (
                  <Cell key={d.label} fill={pnlColor(d.value)} fillOpacity={d.n ? 0.9 : 0.2} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

export function BreakdownTable({ trades }: { trades: Trade[] }) {
  const [by, setBy] = useState<"pair" | "setup" | "exit">("pair");
  const rows = useMemo(
    () =>
      breakdownByField(trades, (t) => (by === "pair" ? t.pair : by === "setup" ? t.setup ?? "Untagged" : t.exitLogic ?? "Unspecified")),
    [trades, by],
  );
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="p-5 pb-0 sm:p-6 sm:pb-0">
        <CardHeader
          icon={Layers}
          title="Performance by"
          subtitle="Where your P&L actually comes from"
          action={
            <SegmentedControl
              options={[
                { value: "pair", label: "Symbol" },
                { value: "setup", label: "Setup" },
                { value: "exit", label: "Exit" },
              ]}
              value={by}
              onChange={setBy}
            />
          }
        />
      </div>
      {rows.length === 0 ? (
        <div className="p-6 pt-0">
          <ChartEmpty className="h-32">No closed trades in this view.</ChartEmpty>
        </div>
      ) : (
        <div className="max-h-[23rem] overflow-auto">
          <table className="w-full min-w-[540px] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-y border-border text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-5 py-2.5 font-semibold sm:px-6">{by === "pair" ? "Symbol" : by === "setup" ? "Setup" : "Exit"}</th>
                <th className="px-3 py-2.5 text-right font-semibold">Trades</th>
                <th className="px-3 py-2.5 text-right font-semibold">Win %</th>
                <th className="px-3 py-2.5 text-right font-semibold">Avg R</th>
                <th className="w-36 px-3 py-2.5" />
                <th className="px-5 py-2.5 text-right font-semibold sm:px-6">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-5 py-2.5 font-semibold sm:px-6">{r.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.trades}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">{Math.round(r.winRate)}%</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">{r.avgR === null ? "—" : `${r.avgR > 0 ? "+" : ""}${r.avgR.toFixed(2)}R`}</td>
                  <td className="px-3 py-2.5">
                    <InlineBar value={r.pnl} max={max} />
                  </td>
                  <td className={cn("px-5 py-2.5 text-right font-semibold tabular-nums sm:px-6", r.pnl >= 0 ? "text-profit" : "text-loss")}>{formatSignedCurrency(r.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function LongShortCard({ trades, startingBalance }: { trades: Trade[]; startingBalance: number }) {
  const { long, short } = useMemo(() => directionSplit(trades, startingBalance), [trades, startingBalance]);
  const sides = [
    { key: "Long", s: long, icon: ArrowUpRight, tone: "text-profit bg-profit-soft" },
    { key: "Short", s: short, icon: ArrowDownRight, tone: "text-loss bg-loss-soft" },
  ];
  const totalTrades = long.closedTrades + short.closedTrades;
  return (
    <Card padding="lg">
      <CardHeader icon={Scale} title="Long vs short" subtitle="Is one side carrying the other?" />
      <div className="mb-4">
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3">
          {totalTrades > 0 && (
            <>
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${(long.closedTrades / totalTrades) * 100}%` }} />
              <div className="h-full flex-1 rounded-full bg-chart-2" />
            </>
          )}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-chart-1" /> Long {totalTrades ? Math.round((long.closedTrades / totalTrades) * 100) : 0}%
          </span>
          <span className="flex items-center gap-1.5">
            Short {totalTrades ? Math.round((short.closedTrades / totalTrades) * 100) : 0}% <span className="h-2 w-2 rounded-full bg-chart-2" />
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {sides.map(({ key, s, icon: Icon, tone }) => (
          <div key={key} className="rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="flex items-center gap-2">
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", tone)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-semibold">{key}</span>
            </div>
            <div className={cn("mt-2 text-lg font-semibold", s.netPnl > 0 ? "text-profit" : s.netPnl < 0 ? "text-loss" : "")}>{signed(s.netPnl)}</div>
            <div className="mt-1.5 space-y-0.5 text-[11px] text-muted">
              <div className="flex justify-between">
                <span>Trades</span>
                <span className="text-foreground">{s.closedTrades}</span>
              </div>
              <div className="flex justify-between">
                <span>Win rate</span>
                <span className="text-foreground">{formatPercent(s.winRate, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Profit factor</span>
                <span className="text-foreground">{s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function HoldingTimeCard({ trades }: { trades: Trade[] }) {
  const data = useMemo(() => holdingTimeBreakdown(trades), [trades]);
  return (
    <Card padding="lg">
      <CardHeader icon={Clock} title="Holding time" subtitle="Net P&L by how long trades stayed open" />
      {data.every((d) => d.trades === 0) ? (
        <ChartEmpty className="h-48">No closed trades in this view.</ChartEmpty>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={{ stroke: AXIS_STROKE }} tickLine={false} interval={0} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={axisMoney} />
              <ReferenceLine y={0} stroke={AXIS_STROKE} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return (
                    <ChartTooltipBox
                      title={d.label}
                      rows={[
                        { label: "Net P&L", value: formatSignedCurrency(d.pnl), tone: d.pnl >= 0 ? "profit" : "loss" },
                        { label: "Trades", value: d.trades },
                        { label: "Win rate", value: `${Math.round(d.winRate)}%` },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="pnl" maxBarSize={BAR_MAX} radius={BAR_RADIUS}>
                {data.map((d) => (
                  <Cell key={d.label} fill={pnlColor(d.pnl)} fillOpacity={d.trades ? 0.9 : 0.2} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export function PnlDistributionCard({ trades }: { trades: Trade[] }) {
  const data = useMemo(() => pnlDistribution(trades), [trades]);
  return (
    <Card padding="lg">
      <CardHeader icon={Sigma} title="P&L distribution" subtitle="How individual trade results spread out" />
      {data.length === 0 ? (
        <ChartEmpty className="h-48">No closed trades in this view.</ChartEmpty>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={{ stroke: AXIS_STROKE }} tickLine={false} tickFormatter={(v) => axisMoney(Number(v))} minTickGap={8} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return <ChartTooltipBox title={`${axisMoney(d.from)} to ${axisMoney(d.to)}`} rows={[{ label: "Trades", value: d.count }]} />;
                }}
              />
              <Bar dataKey="count" maxBarSize={BAR_MAX} radius={BAR_RADIUS}>
                {data.map((d, i) => (
                  <Cell key={i} fill={(d.from + d.to) / 2 >= 0 ? "var(--profit)" : "var(--loss)"} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
