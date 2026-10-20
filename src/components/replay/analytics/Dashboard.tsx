"use client";

import { useId, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { AXIS_TICK, BAR_MAX, ChartEmpty, ChartTooltipBox, GRID_STROKE, axisMoney } from "@/components/charts/kit";
import Card from "@/components/ui/Card";
import { METRIC_HELP, type AnalyticsTrade, type DayCell, type Metrics } from "@/lib/replay/analytics";
import { cn, MONTHS } from "@/lib/utils";
import { fmtNum, fmtPct, fmtR, money, tone } from "../format";
import { Ring, SplitBar, WinGauge } from "./mini";
import type { OnDrill } from "./Charts";

// FX Replay / trading-journal style dashboard: KPI strip, cumulative and daily
// P&L, and a P&L calendar. Every figure comes from the filtered closed trades.

function Help({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <Info className="h-3 w-3 text-faint" aria-hidden />
      <span className="sr-only">{text}</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-60 -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug tracking-normal text-foreground shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

function KpiCard({ label, help, children, side }: { label: string; help?: string; children: React.ReactNode; side?: React.ReactNode }) {
  return (
    <Card padding="sm" className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[12px] font-medium text-muted">
          {label} {help && <Help text={help} />}
        </div>
        <div className="mt-1">{children}</div>
      </div>
      {side && <div className="shrink-0">{side}</div>}
    </Card>
  );
}

export function KpiStrip({ m, ccy }: { m: Metrics; ccy: string }) {
  const ratio = m.avgWin !== null && m.avgLoss !== null && m.avgLoss !== 0 ? Math.abs(m.avgWin / m.avgLoss) : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" data-testid="analytics-kpis">
      <KpiCard label="Net P&L" help={METRIC_HELP.netPnl}>
        <div className={cn("text-[1.45rem] font-bold leading-tight tracking-tight tabular-nums", tone(m.netPnl))}>{money(m.netPnl, ccy, { signed: true })}</div>
        <div className="mt-0.5 text-xs text-muted">
          {m.total} trade{m.total === 1 ? "" : "s"} · {fmtPct(m.returnPct, 2, true)}
        </div>
      </KpiCard>
      <KpiCard label="Trade expectancy" help={METRIC_HELP.expectancyMoney}>
        <div className={cn("text-[1.45rem] font-bold leading-tight tracking-tight tabular-nums", tone(m.expectancyMoney))}>{money(m.expectancyMoney, ccy, { signed: true })}</div>
        <div className="mt-0.5 text-xs text-muted">{fmtR(m.expectancyR)} per trade</div>
      </KpiCard>
      <KpiCard label="Profit factor" help={METRIC_HELP.profitFactor} side={<Ring value={m.grossProfit} rest={m.grossLoss} size={58} />}>
        <div className="text-[1.45rem] font-bold leading-tight tracking-tight tabular-nums">{m.profitFactor !== null ? fmtNum(m.profitFactor) : m.profitFactorNote === "no-losses" ? "∞" : "—"}</div>
        <div className="mt-0.5 truncate text-xs text-muted">
          {money(m.grossProfit, ccy)} / {money(m.grossLoss, ccy)}
        </div>
      </KpiCard>
      <KpiCard
        label="Win %"
        help={METRIC_HELP.winRate}
        side={
          <div className="flex flex-col items-center">
            <WinGauge wins={m.wins} losses={m.losses} breakeven={m.breakeven} size={96} />
            <div className="-mt-0.5 flex gap-1.5 text-[10px] font-semibold tabular-nums">
              <span className="rounded bg-profit-soft px-1 text-profit">{m.wins}</span>
              <span className="rounded bg-info-soft px-1 text-info">{m.breakeven}</span>
              <span className="rounded bg-loss-soft px-1 text-loss">{m.losses}</span>
            </div>
          </div>
        }
      >
        <div className="text-[1.45rem] font-bold leading-tight tracking-tight tabular-nums">{fmtPct(m.winRate)}</div>
        <div className="mt-0.5 text-xs text-muted">W · BE · L</div>
      </KpiCard>
      <KpiCard label="Avg win / loss trade" help={`${METRIC_HELP.avgWin} ${METRIC_HELP.avgLoss}`}>
        <div className="text-[1.45rem] font-bold leading-tight tracking-tight tabular-nums">{ratio !== null ? fmtNum(ratio) : "—"}</div>
        <div className="mt-1.5">
          <SplitBar left={m.avgWin ?? 0} right={m.avgLoss ?? 0} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] font-semibold tabular-nums">
          <span className="text-profit">{money(m.avgWin, ccy)}</span>
          <span className="text-loss">{money(m.avgLoss, ccy)}</span>
        </div>
      </KpiCard>
    </div>
  );
}

const shortDay = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
const longDay = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function drillDay(trades: AnalyticsTrade[], d: DayCell, onDrill?: OnDrill) {
  if (!onDrill) return;
  onDrill({ label: longDay(d.t), ids: new Set(trades.filter((t) => Math.floor(t.exitT / 86_400) * 86_400 === d.t).map((t) => t.id)) });
}

/** Daily net cumulative P&L — green above zero, red below. */
export function CumulativePnl({ days, ccy, trades, onDrill }: { days: DayCell[]; ccy: string; trades: AnalyticsTrade[]; onDrill?: OnDrill }) {
  const id = useId().replace(/:/g, "");
  const data = useMemo(() => [{ t: days.length ? days[0].t - 86_400 : 0, cumulative: 0, net: 0, count: 0, start: true }, ...days.map((d) => ({ ...d, start: false }))], [days]);
  const max = Math.max(0, ...data.map((d) => d.cumulative));
  const min = Math.min(0, ...data.map((d) => d.cumulative));
  const zero = max === min ? 0.5 : max / (max - min);
  return (
    <Card>
      <div className="mb-3 flex items-center gap-1 text-sm font-semibold">
        Daily net cumulative P&amp;L <Help text="Running total of net P&L after each exit day (UTC)." />
      </div>
      {days.length === 0 ? (
        <ChartEmpty>Close trades to draw the curve.</ChartEmpty>
      ) : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} onClick={(e) => {
              const i = typeof e?.activeTooltipIndex === "number" ? e.activeTooltipIndex : Number(e?.activeTooltipIndex);
              if (Number.isFinite(i) && i > 0) drillDay(trades, days[i - 1], onDrill);
            }}>
              <defs>
                <linearGradient id={`cum${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="var(--profit)" stopOpacity={0.35} />
                  <stop offset={zero} stopColor="var(--profit)" stopOpacity={0.06} />
                  <stop offset={zero} stopColor="var(--loss)" stopOpacity={0.06} />
                  <stop offset={1} stopColor="var(--loss)" stopOpacity={0.35} />
                </linearGradient>
                <linearGradient id={`cumLine${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={zero} stopColor="var(--profit)" />
                  <stop offset={zero} stopColor="var(--loss)" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="t" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(t) => shortDay(Number(t))} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={60} tickFormatter={axisMoney} />
              <ReferenceLine y={0} stroke="var(--chart-axis)" />
              <Tooltip
                cursor={{ stroke: "var(--chart-axis)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof data)[number];
                  if (p.start) return <ChartTooltipBox title="Start" rows={[{ label: "Cumulative", value: money(0, ccy) }]} />;
                  return (
                    <ChartTooltipBox
                      title={longDay(p.t)}
                      rows={[
                        { label: "Cumulative", value: money(p.cumulative, ccy, { signed: true }), tone: p.cumulative >= 0 ? "profit" : "loss" },
                        { label: "Day", value: money(p.net, ccy, { signed: true }), tone: p.net >= 0 ? "profit" : "loss" },
                        { label: "Trades", value: String(p.count) },
                      ]}
                      footer={onDrill ? "Click to list this day's trades" : undefined}
                    />
                  );
                }}
              />
              <Area type="linear" dataKey="cumulative" stroke={`url(#cumLine${id})`} strokeWidth={2} fill={`url(#cum${id})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/** Net P&L per exit day as bars. */
export function DailyPnl({ days, ccy, trades, onDrill }: { days: DayCell[]; ccy: string; trades: AnalyticsTrade[]; onDrill?: OnDrill }) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-1 text-sm font-semibold">
        Net daily P&amp;L <Help text="Net P&L of the trades that closed on each day (UTC). Click a bar to list them." />
      </div>
      {days.length === 0 ? (
        <ChartEmpty>Daily results appear once trades close.</ChartEmpty>
      ) : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="t" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(t) => shortDay(Number(t))} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={60} tickFormatter={axisMoney} />
              <ReferenceLine y={0} stroke="var(--chart-axis)" />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as DayCell;
                  return (
                    <ChartTooltipBox
                      title={longDay(p.t)}
                      rows={[
                        { label: "Net", value: money(p.net, ccy, { signed: true }), tone: p.net >= 0 ? "profit" : "loss" },
                        { label: "Trades", value: `${p.count} (${p.wins}W · ${p.losses}L)` },
                      ]}
                      footer={onDrill ? "Click to list this day's trades" : undefined}
                    />
                  );
                }}
              />
              <Bar dataKey="net" maxBarSize={BAR_MAX} radius={[3, 3, 3, 3]} isAnimationActive={false} onClick={(d) => drillDay(trades, d as unknown as DayCell, onDrill)} className={onDrill ? "cursor-pointer" : undefined}>
                {days.map((d) => (
                  <Cell key={d.day} fill={d.net >= 0 ? "var(--profit)" : "var(--loss)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Month calendar of daily P&L (exit day, UTC) with weekly totals. */
export function PnlCalendar({ days, ccy, trades, onDrill }: { days: DayCell[]; ccy: string; trades: AnalyticsTrade[]; onDrill?: OnDrill }) {
  const months = useMemo(() => Array.from(new Set(days.map((d) => d.day.slice(0, 7)))).sort(), [days]);
  const [chosen, setChosen] = useState<string | null>(null);
  const month = chosen && months.includes(chosen) ? chosen : months[months.length - 1] ?? null;
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  if (!month) {
    return (
      <Card>
        <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-muted" /> P&amp;L calendar
        </div>
        <ChartEmpty>The calendar fills in as trades close.</ChartEmpty>
      </Card>
    );
  }
  const [y, mo] = month.split("-").map(Number);
  const first = Date.UTC(y, mo - 1, 1) / 1000;
  const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = new Date(first * 1000).getUTCDay();
  const cells: ({ day: string; n: number } | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => ({ day: `${month}-${String(i + 1).padStart(2, "0")}`, n: i + 1 }))];
  while (cells.length % 7) cells.push(null);
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const monthDays = days.filter((d) => d.day.startsWith(month));
  const monthNet = monthDays.reduce((s, d) => s + d.net, 0);
  const idx = months.indexOf(month);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="pnl-calendar">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-muted" /> P&amp;L calendar
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-30" disabled={idx <= 0} onClick={() => setChosen(months[idx - 1])} aria-label="Previous month with trades">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7.5rem] text-center text-sm font-semibold">
            {MONTHS[mo - 1]} {y}
          </span>
          <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-30" disabled={idx >= months.length - 1} onClick={() => setChosen(months[idx + 1])} aria-label="Next month with trades">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-xs text-muted">
          Monthly: <span className={cn("font-semibold", tone(monthNet))}>{money(monthNet, ccy, { signed: true })}</span> · {monthDays.length} trading day{monthDays.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[repeat(7,minmax(0,1fr))_minmax(6.5rem,0.9fr)] gap-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-center text-[11px] font-medium text-muted">
              {w}
            </div>
          ))}
          <div className="py-1 text-center text-[11px] font-medium text-muted">Week</div>
          {weeks.map((wk, wi) => {
            const wDays = wk.map((c) => (c ? byDay.get(c.day) : undefined)).filter(Boolean) as DayCell[];
            const wNet = wDays.reduce((s, d) => s + d.net, 0);
            return [
              ...wk.map((c, ci) => {
                if (!c) return <div key={`e${wi}-${ci}`} className="h-[4.6rem] rounded-xl bg-surface-2/40" />;
                const d = byDay.get(c.day);
                return (
                  <button
                    key={c.day}
                    type="button"
                    disabled={!d}
                    onClick={() => d && drillDay(trades, d, onDrill)}
                    className={cn(
                      "flex h-[4.6rem] flex-col rounded-xl border p-1.5 text-left transition-colors",
                      d ? (d.net >= 0 ? "border-profit/40 bg-profit-soft hover:border-profit" : "border-loss/40 bg-loss-soft hover:border-loss") : "border-border bg-surface-2/40",
                    )}
                    title={d ? `${longDay(d.t)}: ${money(d.net, ccy, { signed: true })} over ${d.count} trade(s)` : undefined}
                  >
                    <span className="text-[11px] font-medium text-muted">{c.n}</span>
                    {d && (
                      <span className="mt-auto">
                        <span className={cn("block truncate text-[12.5px] font-bold tabular-nums", d.net >= 0 ? "text-profit" : "text-loss")}>{axisMoney(d.net)}</span>
                        <span className="block text-[10px] text-muted">
                          {d.count} trade{d.count === 1 ? "" : "s"}
                        </span>
                      </span>
                    )}
                  </button>
                );
              }),
              <div key={`w${wi}`} className="flex h-[4.6rem] flex-col justify-center rounded-xl border border-border bg-card px-2.5">
                <span className="text-[10.5px] text-muted">Week {wi + 1}</span>
                <span className={cn("text-[13px] font-bold tabular-nums", wDays.length ? tone(wNet) : "text-faint")}>{wDays.length ? money(wNet, ccy, { signed: true }) : "—"}</span>
                <span className="text-[10px] text-muted">
                  {wDays.length} day{wDays.length === 1 ? "" : "s"}
                </span>
              </div>,
            ];
          })}
        </div>
      </div>
    </Card>
  );
}
