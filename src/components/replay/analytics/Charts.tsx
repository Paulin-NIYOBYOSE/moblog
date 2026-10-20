"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, BAR_MAX, BAR_RADIUS, ChartEmpty, ChartTooltipBox, GRID_STROKE, InlineBar, axisMoney } from "@/components/charts/kit";
import Card, { CardHeader } from "@/components/ui/Card";
import SegmentedControl from "@/components/ui/SegmentedControl";
import {
  byMarketSession,
  byWeekday,
  cumulativeR,
  equityCurve,
  groupBy,
  holdingDistribution,
  monthlyReturns,
  rDistribution,
  rollingWinRate,
  WEEKDAY_NAMES,
  type AnalyticsTrade,
  type GroupRow,
} from "@/lib/replay/analytics";
import { formatInTz, marketSessionOf, monthKeyUtc, tradingWeekday } from "@/lib/replay/time";
import { cn, MONTHS } from "@/lib/utils";
import { fmtPct, fmtR, money, tone } from "../format";
import { Activity, BarChart3, CalendarRange, Clock, LineChart as LineIcon, Scale, Sigma, TrendingDown } from "lucide-react";

const H = 220;

/** Clicking a chart element narrows the trade list to the trades behind it. */
export interface Drill {
  label: string;
  ids: Set<string>;
}
export type OnDrill = (d: Drill) => void;

export function EquityAndDrawdown({ trades, initialBalance, ccy }: { trades: AnalyticsTrade[]; initialBalance: number; ccy: string }) {
  const curve = useMemo(() => equityCurve(trades, initialBalance).map((p, i) => ({ ...p, n: i })), [trades, initialBalance]);
  // Small equity ranges need full-precision ticks ($10,015), not "$10K" five times.
  const span = curve.length ? Math.max(...curve.map((p) => p.equity)) - Math.min(...curve.map((p) => p.equity)) : 0;
  const equityTick = (v: number) => (span < 5000 ? `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}` : axisMoney(v));
  return (
    <Card>
      <CardHeader icon={LineIcon} title="Equity curve" subtitle="Realised balance after each exit (partial closes included), in replay order." />
      {curve.length < 2 ? (
        <ChartEmpty>Close at least one trade to draw the equity curve.</ChartEmpty>
      ) : (
        <>
          <div style={{ height: H }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="n" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} tickFormatter={equityTick} domain={["auto", "auto"]} />
                <ReferenceLine y={initialBalance} stroke="var(--chart-axis)" />
                <Tooltip
                  cursor={{ stroke: "var(--chart-axis)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof curve)[number];
                    return (
                      <ChartTooltipBox
                        title={p.n === 0 ? "Start" : `Exit #${p.n} · ${formatInTz(p.t, "UTC", "short")} UTC`}
                        rows={[
                          { label: "Equity", value: money(p.equity, ccy) },
                          { label: "Drawdown", value: `${money(p.drawdown, ccy)} (${fmtPct(p.drawdownPct)})`, tone: p.drawdown > 0 ? "loss" : "muted" },
                        ]}
                      />
                    );
                  }}
                />
                <Area type="linear" dataKey="equity" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.08} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 text-xs font-semibold text-muted">Drawdown from running peak</div>
          <div style={{ height: 110 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="n" hide />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `${(+v).toFixed(0)}%`} reversed domain={[0, "auto"]} />
                <Tooltip
                  cursor={{ stroke: "var(--chart-axis)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof curve)[number];
                    return <ChartTooltipBox title={p.n === 0 ? "Start" : `Exit #${p.n}`} rows={[{ label: "Drawdown", value: `${money(p.drawdown, ccy)} · ${fmtPct(p.drawdownPct, 2)}`, tone: "loss" }]} />;
                  }}
                />
                <Area type="linear" dataKey="drawdownPct" stroke="var(--loss)" strokeWidth={1.5} fill="var(--loss)" fillOpacity={0.12} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

export function CumulativeRChart({ trades }: { trades: AnalyticsTrade[] }) {
  const data = useMemo(() => [{ t: 0, r: 0, n: 0 }, ...cumulativeR(trades)], [trades]);
  return (
    <Card>
      <CardHeader icon={Sigma} title="Cumulative R" subtitle="Running sum of R-multiples — compares sessions independent of position size." />
      {data.length < 3 ? (
        <ChartEmpty>Needs two or more trades with an initial stop-loss.</ChartEmpty>
      ) : (
        <div style={{ height: H }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="n" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}R`} />
              <ReferenceLine y={0} stroke="var(--chart-axis)" />
              <Tooltip
                cursor={{ stroke: "var(--chart-axis)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof data)[number];
                  return <ChartTooltipBox title={p.n ? `Trade #${p.n}` : "Start"} rows={[{ label: "Cumulative", value: fmtR(p.r), tone: p.r >= 0 ? "profit" : "loss" }]} />;
                }}
              />
              <Line type="linear" dataKey="r" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export function RDistributionChart({ trades, onDrill }: { trades: AnalyticsTrade[]; onDrill?: OnDrill }) {
  const bins = useMemo(() => rDistribution(trades), [trades]);
  const total = bins.reduce((s, b) => s + b.count, 0);
  return (
    <Card>
      <CardHeader icon={BarChart3} title="R-multiple distribution" subtitle="How many trades landed in each 0.5R bucket." />
      {total < 2 ? (
        <ChartEmpty>Needs two or more trades with an initial stop-loss.</ChartEmpty>
      ) : (
        <div style={{ height: H }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 9 }} tickLine={false} axisLine={false} interval={1} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const b = payload[0].payload as (typeof bins)[number];
                  return <ChartTooltipBox title={`${b.label}${b.label.endsWith("R") ? "" : "R"}`} rows={[{ label: "Trades", value: b.count }, { label: "Share", value: fmtPct((b.count / total) * 100) }]} />;
                }}
              />
              <Bar
                dataKey="count"
                maxBarSize={BAR_MAX}
                radius={BAR_RADIUS}
                isAnimationActive={false}
                cursor={onDrill ? "pointer" : undefined}
                onClick={(d: { payload?: { from: number; to: number; label: string } }) => {
                  const b = d?.payload;
                  if (!b || !onDrill) return;
                  onDrill({ label: `R in ${b.label}`, ids: new Set(trades.filter((t) => t.rMultiple !== null && t.rMultiple >= b.from && t.rMultiple < b.to).map((t) => t.id)) });
                }}
              >
                {bins.map((b) => (
                  <Cell key={b.label} fill={b.to <= 0 ? "var(--loss)" : "var(--profit)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export function RollingWinRateChart({ trades }: { trades: AnalyticsTrade[] }) {
  const window = trades.length >= 40 ? 20 : 10;
  const data = useMemo(() => rollingWinRate(trades, window), [trades, window]);
  return (
    <Card>
      <CardHeader icon={Activity} title="Rolling win rate" subtitle={`Win rate over the last ${window} trades.`} />
      {data.length < 2 ? (
        <ChartEmpty>Needs at least {window + 1} closed trades.</ChartEmpty>
      ) : (
        <div style={{ height: H }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="n" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <ReferenceLine y={50} stroke="var(--chart-axis)" />
              <Tooltip
                cursor={{ stroke: "var(--chart-axis)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof data)[number];
                  return <ChartTooltipBox title={`Trades ${p.n - window + 1}–${p.n}`} rows={[{ label: "Win rate", value: fmtPct(p.winRate, 0) }]} />;
                }}
              />
              <Line type="linear" dataKey="winRate" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function heatColor(v: number, max: number): string {
  if (!max || Math.abs(v) < 0.005) return "var(--surface-3)";
  const steps = [22, 42, 66, 92];
  const level = Math.min(3, Math.max(0, Math.ceil((Math.abs(v) / max) * 4) - 1));
  return `color-mix(in srgb, ${v > 0 ? "var(--profit)" : "var(--loss)"} ${steps[level]}%, var(--surface-3))`;
}

export function MonthlyReturns({ trades, initialBalance, ccy, onDrill }: { trades: AnalyticsTrade[]; initialBalance: number; ccy: string; onDrill?: OnDrill }) {
  const { months, years } = useMemo(() => monthlyReturns(trades, initialBalance), [trades, initialBalance]);
  const byMonth = useMemo(() => new Map(months.map((m) => [m.month, m])), [months]);
  const maxMonth = Math.max(0, ...months.map((m) => Math.abs(m.pct ?? 0)));
  const maxYear = Math.max(0, ...years.map((y) => Math.abs(y.pct ?? 0)));
  const pctText = (v: number | null) => (v === null ? "—" : `${v > 0.005 ? "+" : v < -0.005 ? "−" : ""}${Math.abs(v).toFixed(2)}%`);
  const drill = (label: string, match: (t: AnalyticsTrade) => boolean) => onDrill?.({ label, ids: new Set(trades.filter(match).map((t) => t.id)) });
  const cell = (key: string, label: string, r: { net: number; count: number; startBalance: number; pct: number | null }, max: number, match: (t: AnalyticsTrade) => boolean, strong = false) => (
    <div
      key={key}
      role="button"
      tabIndex={0}
      onClick={() => drill(label, match)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), drill(label, match))}
      className={cn("group relative flex h-14 flex-col items-center justify-center rounded-lg text-center tabular-nums transition-shadow", onDrill && "hover:ring-2 hover:ring-accent/60")}
      style={{ background: heatColor(r.pct ?? 0, max) }}
      aria-label={`${label}: ${pctText(r.pct)}, ${money(r.net, ccy, { signed: true })} over ${r.count} trade${r.count === 1 ? "" : "s"}`}
      data-testid="return-cell"
    >
      <span className={cn("text-foreground", strong ? "text-[0.95rem] font-bold" : "text-[0.85rem] font-semibold")}>{pctText(r.pct)}</span>
      <span className="text-[10px] text-foreground/60">
        {r.count} trade{r.count === 1 ? "" : "s"}
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 text-left group-hover:block group-focus-visible:block">
        <ChartTooltipBox
          title={label}
          rows={[
            { label: "Return", value: pctText(r.pct), tone: (r.pct ?? 0) >= 0 ? "profit" : "loss" },
            { label: "Net P&L", value: money(r.net, ccy, { signed: true }), tone: r.net >= 0 ? "profit" : "loss" },
            { label: "Start balance", value: money(r.startBalance, ccy) },
            { label: "Trades", value: String(r.count) },
          ]}
          footer={onDrill ? "Click to list these trades" : undefined}
        />
      </span>
    </div>
  );
  return (
    <Card>
      <CardHeader icon={CalendarRange} title="Monthly returns" subtitle="Return on the balance at the start of each month, by exit month (UTC). The year column compounds its months." />
      {!months.length ? (
        <ChartEmpty>Monthly returns appear once trades close.</ChartEmpty>
      ) : (
        <div className="overflow-x-auto" data-testid="monthly-returns">
          <div className="grid min-w-[880px] grid-cols-[3.5rem_repeat(12,minmax(0,1fr))_minmax(5.5rem,1.15fr)] gap-1.5">
            <div />
            {MONTHS.map((m) => (
              <div key={m} className="pb-0.5 text-center text-[11px] font-medium text-muted">
                {m.slice(0, 3)}
              </div>
            ))}
            <div className="pb-0.5 text-center text-[11px] font-semibold text-muted">Year</div>
            {years.map((y) => [
              <div key={`l${y.year}`} className="flex items-center text-sm font-semibold text-muted">
                {y.year}
              </div>,
              ...MONTHS.map((name, i) => {
                const key = `${y.year}-${String(i + 1).padStart(2, "0")}`;
                const r = byMonth.get(key);
                if (!r) return <div key={key} className="h-14 rounded-lg border border-dashed border-border/70" aria-label={`${name} ${y.year}: no trades`} />;
                return cell(key, `${name} ${y.year}`, r, maxMonth, (t) => monthKeyUtc(t.exitT) === key);
              }),
              cell(`y${y.year}`, `${y.year} (year)`, y, maxYear, (t) => monthKeyUtc(t.exitT).startsWith(y.year), true),
            ])}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1.5 text-[10.5px] text-muted">
            <span>{pctText(-maxMonth)}</span>
            {[-1, -0.6, -0.3, 0, 0.3, 0.6, 1].map((k) => (
              <span key={k} className="h-3 w-6 rounded-sm" style={{ background: heatColor(k * (maxMonth || 1), maxMonth || 1) }} />
            ))}
            <span>{pctText(maxMonth)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

export function LongShort({ trades, ccy, be }: { trades: AnalyticsTrade[]; ccy: string; be: number }) {
  const rows = groupBy(trades, (t) => (t.side === "buy" ? "Long" : "Short"), be, ["Long", "Short"]);
  return (
    <Card>
      <CardHeader icon={Scale} title="Long vs short" />
      {!trades.length ? (
        <ChartEmpty>No trades in this selection.</ChartEmpty>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {["Long", "Short"].map((k) => {
            const r = rows.find((x) => x.key === k);
            return (
              <div key={k} className="rounded-xl border border-border p-3">
                <div className={cn("text-xs font-bold uppercase tracking-wider", k === "Long" ? "text-profit" : "text-loss")}>{k === "Long" ? "▲ Long" : "▼ Short"}</div>
                <div className={cn("mt-1 text-lg font-semibold", tone(r?.net))}>{money(r?.net ?? 0, ccy, { signed: true })}</div>
                <dl className="mt-1 grid grid-cols-2 gap-y-0.5 text-[11.5px]">
                  <dt className="text-muted">Trades</dt>
                  <dd className="text-right tabular-nums">{r?.count ?? 0}</dd>
                  <dt className="text-muted">Win rate</dt>
                  <dd className="text-right tabular-nums">{fmtPct(r?.winRate ?? null, 0)}</dd>
                  <dt className="text-muted">Avg R</dt>
                  <dd className="text-right tabular-nums">{fmtR(r?.avgR ?? null)}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

type BreakdownKey = "session" | "weekday" | "symbol" | "timeframe" | "strategy" | "setup" | "tag" | "holding";

const BREAKDOWN_LABEL: Record<BreakdownKey, string> = {
  session: "Session",
  weekday: "Weekday",
  symbol: "Instrument",
  timeframe: "Timeframe",
  strategy: "Strategy",
  setup: "Setup",
  tag: "Tag",
  holding: "Holding time",
};

/** The group(s) a trade falls into for a breakdown — mirrors the grouping above. */
function groupKeyOf(key: BreakdownKey, t: AnalyticsTrade): string[] {
  switch (key) {
    case "session":
      return [marketSessionOf(t.entryT)];
    case "weekday":
      return [WEEKDAY_NAMES[tradingWeekday(t.entryT)]];
    case "symbol":
      return [t.symbol];
    case "timeframe":
      return [t.timeframe];
    case "strategy":
      return [t.strategy];
    case "setup":
      return [t.setup];
    case "tag":
      return t.tags.length ? t.tags : ["(untagged)"];
    case "holding":
      return holdingDistribution([t]).filter((b) => b.count).map((b) => b.label);
  }
}

export function Breakdowns({ trades, ccy, be, onDrill }: { trades: AnalyticsTrade[]; ccy: string; be: number; onDrill?: OnDrill }) {
  const [key, setKey] = useState<BreakdownKey>("session");
  const rows: GroupRow[] = useMemo(() => {
    switch (key) {
      case "session":
        return byMarketSession(trades, be);
      case "weekday":
        return byWeekday(trades, be).filter((r) => r.count > 0);
      case "symbol":
        return groupBy(trades, (t) => t.symbol, be);
      case "timeframe":
        return groupBy(trades, (t) => t.timeframe, be);
      case "strategy":
        return groupBy(trades, (t) => (t as AnalyticsTrade).strategy, be);
      case "setup":
        return groupBy(trades, (t) => (t as AnalyticsTrade).setup, be);
      case "tag":
        return groupBy(trades, (t) => ((t as AnalyticsTrade).tags.length ? (t as AnalyticsTrade).tags : ["(untagged)"]), be);
      case "holding": {
        const bins = holdingDistribution(trades);
        return bins.map((b) => {
          const list = trades.filter((t) => t.holdingSeconds >= b.from && t.holdingSeconds < b.to);
          return groupBy(list, () => b.label, be)[0] ?? { key: b.label, count: 0, wins: 0, winRate: null, net: 0, totalR: 0, avgR: null };
        });
      }
    }
  }, [trades, key, be]);
  const max = Math.max(...rows.map((r) => Math.abs(r.net)), 0);
  return (
    <Card>
      <CardHeader icon={Clock} title="Performance breakdown" subtitle={key === "session" ? "Market session of entry (London and New York 08:00–17:00 local, DST-aware)." : key === "weekday" ? "Trading weekday of entry (17:00 New York roll)." : key === "tag" ? "A trade with several tags counts in each." : undefined} />
      <SegmentedControl
        className="mb-3"
        value={key}
        onChange={setKey}
        options={[
          { value: "session", label: "Session" },
          { value: "weekday", label: "Weekday" },
          { value: "symbol", label: "Instrument" },
          { value: "timeframe", label: "Timeframe" },
          { value: "strategy", label: "Strategy" },
          { value: "setup", label: "Setup" },
          { value: "tag", label: "Tag" },
          { value: "holding", label: "Holding time" },
        ]}
      />
      {!trades.length ? (
        <ChartEmpty>No trades in this selection.</ChartEmpty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="py-1.5 text-left font-semibold">Group</th>
                <th className="text-right font-semibold">Trades</th>
                <th className="text-right font-semibold">Win rate</th>
                <th className="text-right font-semibold">Avg R</th>
                <th className="text-right font-semibold">Net P&amp;L</th>
                <th className="w-40 pl-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.key}
                  className={cn("border-b border-border/60", onDrill && r.count > 0 && "cursor-pointer hover:bg-surface-2")}
                  onClick={() => onDrill && r.count > 0 && onDrill({ label: `${BREAKDOWN_LABEL[key]}: ${r.key}`, ids: new Set(trades.filter((t) => groupKeyOf(key, t).includes(r.key)).map((t) => t.id)) })}
                >
                  <td className="py-1.5 font-medium">{r.key}</td>
                  <td className="text-right tabular-nums">{r.count}</td>
                  <td className="text-right tabular-nums" title={r.count < 30 ? "Fewer than 30 trades — not statistically meaningful" : undefined}>
                    {fmtPct(r.winRate, 0)}
                    {r.count < 30 && r.count > 0 && <span className="ml-0.5 text-faint">*</span>}
                  </td>
                  <td className={cn("text-right tabular-nums", tone(r.avgR))}>{fmtR(r.avgR)}</td>
                  <td className={cn("text-right font-semibold tabular-nums", tone(r.net))}>{money(r.net, ccy, { signed: true })}</td>
                  <td className="pl-3">
                    <InlineBar value={r.net} max={max} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function DrawdownNote({ peakT, troughT, recoveryT }: { peakT: number | null; troughT: number | null; recoveryT: number | null }) {
  if (peakT === null || troughT === null) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted">
      <TrendingDown className="h-3 w-3" /> Max drawdown: peak {formatInTz(peakT, "UTC", "short")} → trough {formatInTz(troughT, "UTC", "short")} UTC ·{" "}
      {recoveryT ? `recovered ${formatInTz(recoveryT, "UTC", "short")}` : "not yet recovered"}
    </p>
  );
}

/** Trades closed per month (bars) — how much was actually traded, and when. */
export function ActivityChart({ trades, ccy, onDrill }: { trades: AnalyticsTrade[]; ccy: string; onDrill?: OnDrill }) {
  const data = useMemo(() => {
    const m = new Map<string, { month: string; count: number; net: number; wins: number }>();
    for (const t of trades) {
      const k = new Date(t.exitT * 1000).toISOString().slice(0, 7);
      const c = m.get(k) ?? { month: k, count: 0, net: 0, wins: 0 };
      c.count++;
      c.net += t.netPnl;
      if (t.netPnl > 0) c.wins++;
      m.set(k, c);
    }
    return Array.from(m.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [trades]);
  return (
    <Card>
      <CardHeader icon={CalendarRange} title="Trading activity" subtitle="Closed trades per month of replayed history. Click a bar to list those trades." />
      {data.length < 2 ? (
        <ChartEmpty>Activity appears once trades close in at least two different months.</ChartEmpty>
      ) : (
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return (
                    <ChartTooltipBox
                      title={d.month}
                      rows={[
                        { label: "Trades", value: d.count },
                        { label: "Win rate", value: fmtPct((d.wins / d.count) * 100, 0) },
                        { label: "Net", value: money(d.net, ccy, { signed: true }), tone: d.net >= 0 ? "profit" : "loss" },
                      ]}
                    />
                  );
                }}
              />
              <Bar
                dataKey="count"
                fill="var(--chart-1)"
                maxBarSize={BAR_MAX}
                radius={BAR_RADIUS}
                isAnimationActive={false}
                cursor={onDrill ? "pointer" : undefined}
                onClick={(d: { payload?: { month: string } }) => {
                  const k = d?.payload?.month;
                  if (!k || !onDrill) return;
                  onDrill({ label: `Closed in ${k}`, ids: new Set(trades.filter((t) => new Date(t.exitT * 1000).toISOString().slice(0, 7) === k).map((t) => t.id)) });
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
