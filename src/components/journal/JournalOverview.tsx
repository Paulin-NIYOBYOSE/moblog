"use client";

import { useMemo, useState } from "react";
import {
  AlertOctagon,
  Award,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  Flame,
  Gem,
  HeartPulse,
  ListChecks,
  Scale,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card, { CardHeader } from "@/components/ui/Card";
import StatTile from "@/components/ui/StatTile";
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
  HBAR_RADIUS,
  InlineBar,
  LegendItem,
  pnlColor,
  SemiGauge,
} from "@/components/charts/kit";
import {
  checklistImpact,
  emotionImpact,
  gradeBuckets,
  mistakeImpact,
  monthlyRows,
  MOOD_LABELS,
  scaleBuckets,
  summarize,
  trendSeries,
  VALENCE_COLOR,
  weeklyRows,
  type JournalRow,
} from "@/lib/journal";
import { CHECKLIST, gradeFor, GRADE_STYLE, STRATEGY_NAME } from "@/lib/strategy";
import { monthLabel, weekLabel } from "@/lib/periods";
import { cn, formatSignedCurrency } from "@/lib/utils";

const signed = (v: number) => formatSignedCurrency(v, { compact: true });

export default function JournalOverview({
  rows,
  allRows,
  tradingDays,
  streak,
  onSelectDay,
}: {
  rows: JournalRow[];
  /** Rows not limited by the period filter, for the year heatmap. */
  allRows: JournalRow[];
  tradingDays: number;
  streak: number;
  onSelectDay: (day: string) => void;
}) {
  const summary = useMemo(() => summarize(rows, tradingDays), [rows, tradingDays]);
  const [reviewBy, setReviewBy] = useState<"week" | "month">("week");

  const grades = useMemo(() => gradeBuckets(rows), [rows]);
  const rules = useMemo(() => checklistImpact(rows), [rows]);
  const emotions = useMemo(() => emotionImpact(rows, "any").slice(0, 10), [rows]);
  const mistakes = useMemo(() => mistakeImpact(rows), [rows]);
  const moods = useMemo(() => scaleBuckets(rows, "mood"), [rows]);
  const trend = useMemo(() => trendSeries(rows), [rows]);
  const review = useMemo(() => (reviewBy === "week" ? weeklyRows(rows) : monthlyRows(rows)), [rows, reviewBy]);

  const years = useMemo(() => {
    const set = new Set(allRows.map((r) => Number(r.entry.day.slice(0, 4))));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [allRows]);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const heat = useMemo(() => {
    const map = new Map<string, HeatCell>();
    for (const r of allRows) {
      const prev = map.get(r.entry.day);
      const value = (prev?.value ?? 0) + r.pnl;
      const grade = gradeFor(r.entry.checklist);
      map.set(r.entry.day, {
        value,
        lines: [
          r.traded ? `${formatSignedCurrency(value)} · ${r.closed} trade${r.closed === 1 ? "" : "s"}` : "No trades — journaled",
          ...(grade ? [`Setup grade ${grade}`] : []),
          ...(r.entry.mood ? [`Mood: ${MOOD_LABELS[r.entry.mood - 1]}`] : []),
          ...(r.entry.followedPlan === null ? [] : [r.entry.followedPlan ? "Followed plan" : "Broke plan"]),
        ],
      });
    }
    return map;
  }, [allRows]);

  const valence = useMemo(() => {
    const counts = { positive: 0, neutral: 0, negative: 0 };
    for (const e of emotionImpact(rows, "any")) counts[e.valence ?? "neutral"] += e.count;
    return counts;
  }, [rows]);
  const valenceTotal = valence.positive + valence.neutral + valence.negative;

  const maxMistake = Math.max(1, ...mistakes.map((m) => Math.abs(m.totalPnl)));
  const maxRuleEdge = Math.max(1, ...rules.map((r) => Math.abs(r.edge ?? 0)));
  const planEdge = summary.avgPnlFollowed !== null && summary.avgPnlBroken !== null ? summary.avgPnlFollowed - summary.avgPnlBroken : null;
  const hasSetups = summary.setups > 0;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Entries" icon={BookOpen} accent="accent">
          <div className="mt-2 text-2xl font-semibold tracking-tight">{summary.entries}</div>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted">
            <Flame className={cn("h-3.5 w-3.5", streak > 0 ? "text-gold" : "text-faint")} />
            {streak} day streak
          </p>
        </StatTile>

        <StatTile label="Setup quality" icon={Gem} accent="gold">
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {summary.avgChecklist === null ? "—" : summary.avgChecklist.toFixed(1)}
            <span className="text-sm font-normal text-muted">/{CHECKLIST.length}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {summary.aPlusSetups} A+ of {summary.setups} setups
          </p>
        </StatTile>

        <StatTile label="Plan kept" icon={ListChecks} accent="profit">
          <div className="mt-1.5 flex items-end gap-3">
            <SemiGauge
              size={76}
              stroke={7}
              segments={[
                { value: summary.planFollowed, color: "var(--profit)" },
                { value: summary.planAnswered - summary.planFollowed, color: "var(--loss)" },
              ]}
            />
            <div className="pb-0.5">
              <div className="text-xl font-semibold leading-none tracking-tight">{summary.adherencePct === null ? "—" : `${Math.round(summary.adherencePct)}%`}</div>
              <div className="mt-1 text-[11px] text-muted">
                {summary.planFollowed}/{summary.planAnswered} days
              </div>
            </div>
          </div>
        </StatTile>

        <StatTile label="Avg mood" icon={HeartPulse} accent="info">
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {summary.avgMood === null ? "—" : summary.avgMood.toFixed(1)}
            <span className="text-sm font-normal text-muted">/5</span>
          </div>
          <p className="mt-1 text-xs text-muted">{summary.avgMood === null ? "Not rated yet" : MOOD_LABELS[Math.round(summary.avgMood) - 1]}</p>
        </StatTile>

        <StatTile label="Journaled P&L" icon={Wallet} accent={summary.pnl >= 0 ? "profit" : "loss"}>
          <div className={cn("mt-2 truncate text-2xl font-semibold tracking-tight", summary.pnl > 0 ? "text-profit" : summary.pnl < 0 ? "text-loss" : "")}>{signed(summary.pnl)}</div>
          <p className="mt-1 text-xs text-muted">
            <span className="text-profit">{summary.greenDays} green</span> · <span className="text-loss">{summary.redDays} red</span> days
          </p>
        </StatTile>

        <StatTile label="Plan edge" icon={Scale} accent={planEdge !== null && planEdge >= 0 ? "profit" : "warning"}>
          <div className={cn("mt-2 truncate text-2xl font-semibold tracking-tight", planEdge !== null && (planEdge >= 0 ? "text-profit" : "text-loss"))}>{planEdge === null ? "—" : signed(planEdge)}</div>
          <p className="mt-1 truncate text-xs text-muted">kept vs broken, per day</p>
        </StatTile>
      </div>

      {/* Strategy */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card padding="lg" className="xl:col-span-2">
          <CardHeader icon={Award} tone="gold" title="Strategy edge" subtitle={`Average day P&L by ${STRATEGY_NAME} setup grade`} />
          {!hasSetups ? (
            <ChartEmpty className="h-64">Tick the checklist in your entries to grade your setups.</ChartEmpty>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={grades} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis dataKey="label" tick={{ ...AXIS_TICK, fill: "var(--foreground)", fontWeight: 600 }} axisLine={{ stroke: AXIS_STROKE }} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={axisMoney} />
                    <ReferenceLine y={0} stroke={AXIS_STROKE} />
                    <Tooltip
                      cursor={{ fill: "var(--surface-2)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as (typeof grades)[number];
                        return (
                          <ChartTooltipBox
                            title={d.grade === "None" ? "No setup ticked" : `Grade ${d.grade}`}
                            rows={[
                              { label: "Avg day P&L", value: formatSignedCurrency(d.avgPnl), tone: d.avgPnl >= 0 ? "profit" : "loss" },
                              { label: "Total", value: formatSignedCurrency(d.totalPnl), tone: d.totalPnl >= 0 ? "profit" : "loss" },
                              { label: "Green days", value: `${Math.round(d.winDayPct)}%` },
                              { label: "Days", value: d.count },
                            ]}
                          />
                        );
                      }}
                    />
                    <Bar dataKey="avgPnl" maxBarSize={36} radius={BAR_RADIUS}>
                      {grades.map((g) => (
                        <Cell key={g.grade} fill={pnlColor(g.avgPnl)} fillOpacity={g.tradedCount ? 0.9 : 0.15} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {grades.slice(0, 4).map((g) => (
                  <div key={g.grade} className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-center">
                    <span className={cn("rounded px-1 text-[11px] font-bold", GRADE_STYLE[g.grade as keyof typeof GRADE_STYLE].chip)}>{g.grade}</span>
                    <div className="mt-1 text-[11px] text-muted">{g.count} days</div>
                    <div className="text-[11px] font-semibold">{g.tradedCount ? `${Math.round(g.winDayPct)}% green` : "—"}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card padding="lg" className="xl:col-span-3">
          <CardHeader icon={ListChecks} title="Which rules pay" subtitle="Average day P&L when each checklist rule held vs when it didn't" />
          {!hasSetups ? (
            <ChartEmpty className="h-64">Your checklist ticks build this table.</ChartEmpty>
          ) : (
            <div className="space-y-2.5">
              {rules.map((r) => (
                <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_3.25rem_6rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_3.25rem_8rem_5rem]">
                  <span className="flex min-w-0 items-center gap-2 text-[13px]">
                    <span className="w-7 shrink-0 rounded bg-surface-3 py-px text-center text-[9px] font-bold text-muted">{r.tf}</span>
                    <span className="truncate">{r.label}</span>
                  </span>
                  <span className="text-right text-[11px] tabular-nums text-muted" title="How often it held on setup days">
                    {Math.round(r.heldPct)}%
                  </span>
                  <span className="hidden sm:block">{r.edge !== null ? <InlineBar value={r.edge} max={maxRuleEdge} /> : <span className="block h-1.5 rounded-full bg-surface-3" />}</span>
                  <span className={cn("text-right text-xs font-semibold tabular-nums", r.edge === null ? "text-faint" : r.edge >= 0 ? "text-profit" : "text-loss")}>
                    {r.edge === null ? "—" : signed(r.edge)}
                  </span>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-muted">% = how often the rule held · bar = extra day P&L when it held. Needs days both with and without the rule.</p>
            </div>
          )}
        </Card>
      </div>

      {/* Emotions & mood */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card padding="lg" className="xl:col-span-3">
          <CardHeader icon={Brain} title="Emotional edge" subtitle="Average day P&L when each emotion was logged" />
          {emotions.filter((e) => e.tradedCount > 0).length === 0 ? (
            <ChartEmpty className="h-64">Tag emotions on trading days to see their impact.</ChartEmpty>
          ) : (
            <div style={{ height: Math.max(220, emotions.length * 32 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={emotions} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={axisMoney} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={96}
                    axisLine={false}
                    tickLine={false}
                    tick={(props) => {
                      const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
                      const row = emotions.find((e) => e.label === payload.value);
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <circle cx={-88} cy={0} r={3} fill={VALENCE_COLOR[row?.valence ?? "neutral"]} />
                          <text x={-80} y={0} dy={4} fill="var(--foreground)" fontSize={11.5} textAnchor="start">
                            {payload.value}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <ReferenceLine x={0} stroke={AXIS_STROKE} />
                  <Tooltip
                    cursor={{ fill: "var(--surface-2)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof emotions)[number];
                      return (
                        <ChartTooltipBox
                          title={d.label}
                          rows={[
                            { label: "Avg day P&L", value: formatSignedCurrency(d.avgPnl), tone: d.avgPnl >= 0 ? "profit" : "loss" },
                            { label: "Green days", value: `${Math.round(d.winDayPct)}%` },
                            { label: "Logged", value: `${d.count}×` },
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="avgPnl" maxBarSize={18} radius={HBAR_RADIUS}>
                    {emotions.map((e) => (
                      <Cell key={e.label} fill={pnlColor(e.avgPnl)} fillOpacity={e.tradedCount ? 0.9 : 0.25} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card padding="lg" className="xl:col-span-2">
          <CardHeader icon={TrendingUp} title="Mood vs performance" subtitle="Average day P&L per mood" />
          {moods.every((s) => s.tradedCount === 0) ? (
            <ChartEmpty className="h-52">Rate your mood to unlock this view.</ChartEmpty>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moods} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: AXIS_STROKE }} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={axisMoney} />
                  <ReferenceLine y={0} stroke={AXIS_STROKE} />
                  <Tooltip
                    cursor={{ fill: "var(--surface-2)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof moods)[number];
                      return (
                        <ChartTooltipBox
                          title={d.label}
                          rows={[
                            { label: "Avg day P&L", value: formatSignedCurrency(d.avgPnl), tone: d.avgPnl >= 0 ? "profit" : "loss" },
                            { label: "Green days", value: `${Math.round(d.winDayPct)}%` },
                            { label: "Days", value: d.count },
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="avgPnl" maxBarSize={BAR_MAX} radius={BAR_RADIUS}>
                    {moods.map((s) => (
                      <Cell key={s.level} fill={pnlColor(s.avgPnl)} fillOpacity={s.tradedCount ? 0.9 : 0.2} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold">Emotional balance</span>
              <span className="text-muted">{valenceTotal} logged</span>
            </div>
            <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3">
              {(["positive", "neutral", "negative"] as const).map((k) =>
                valence[k] > 0 ? <div key={k} className="h-full rounded-full" style={{ width: `${(valence[k] / valenceTotal) * 100}%`, background: VALENCE_COLOR[k] }} /> : null,
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <LegendItem color={VALENCE_COLOR.positive} label={`Constructive ${valenceTotal ? Math.round((valence.positive / valenceTotal) * 100) : 0}%`} />
              <LegendItem color={VALENCE_COLOR.neutral} label={`Neutral ${valenceTotal ? Math.round((valence.neutral / valenceTotal) * 100) : 0}%`} />
              <LegendItem color={VALENCE_COLOR.negative} label={`Destructive ${valenceTotal ? Math.round((valence.negative / valenceTotal) * 100) : 0}%`} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card padding="lg" className="xl:col-span-2">
          <CardHeader icon={AlertOctagon} tone="loss" title="Cost of mistakes" subtitle="Total P&L on days each mistake happened" />
          {mistakes.length === 0 ? (
            <ChartEmpty className="h-56">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-profit" /> No mistakes logged in this period
              </span>
            </ChartEmpty>
          ) : (
            <div className="space-y-3">
              {mistakes.slice(0, 8).map((m) => (
                <div key={m.label}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{m.label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-muted">{m.count}×</span>
                      <span className={cn("w-20 text-right text-xs font-semibold tabular-nums", m.totalPnl >= 0 ? "text-profit" : "text-loss")}>{signed(m.totalPnl)}</span>
                    </span>
                  </div>
                  <InlineBar value={m.totalPnl} max={maxMistake} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card padding="lg" className="xl:col-span-3">
          <CardHeader icon={HeartPulse} title="Mood trend" subtitle="5-entry rolling average (1–5)" />
          {trend.filter((t) => t.mood !== null).length < 2 ? (
            <ChartEmpty className="h-60">Rate a few days to see your trend.</ChartEmpty>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: AXIS_STROKE }} tickLine={false} minTickGap={24} />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} />
                  <Tooltip
                    cursor={{ stroke: AXIS_STROKE }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof trend)[number];
                      return (
                        <ChartTooltipBox
                          title={d.label}
                          rows={[
                            { label: "Mood (avg)", value: d.moodAvg?.toFixed(1) ?? "—" },
                            { label: "Day P&L", value: formatSignedCurrency(d.pnl), tone: d.pnl >= 0 ? "profit" : "loss" },
                          ]}
                        />
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="moodAvg" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card padding="lg">
        <CardHeader
          icon={CalendarDays}
          title="Year in review"
          subtitle="Every journaled day, colored by that day's P&L — click a day to open it"
          action={<SegmentedControl options={years.map((y) => ({ value: String(y), label: String(y) }))} value={String(year)} onChange={(v) => setYear(Number(v))} />}
        />
        <YearHeatmap year={year} cells={heat} onSelect={onSelectDay} />
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <CardHeader
            icon={ListChecks}
            title={reviewBy === "week" ? "Weekly review" : "Monthly review"}
            subtitle="How each period felt and paid"
            action={
              <SegmentedControl
                options={[
                  { value: "week", label: "Weekly" },
                  { value: "month", label: "Monthly" },
                ]}
                value={reviewBy}
                onChange={setReviewBy}
              />
            }
          />
        </div>
        {review.length === 0 ? (
          <div className="p-6 pt-0">
            <ChartEmpty className="h-32">No entries in this period.</ChartEmpty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-y border-border text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-5 py-2.5 font-semibold sm:px-6">{reviewBy === "week" ? "Week" : "Month"}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Entries</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Mood</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Checklist</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Plan kept</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Green / red</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Mistakes</th>
                  <th className="px-5 py-2.5 text-right font-semibold sm:px-6">P&L</th>
                </tr>
              </thead>
              <tbody>
                {review.slice(0, 12).map((r) => (
                  <tr key={r.key} className="border-b border-border transition-colors last:border-0 hover:bg-surface-2">
                    <td className="px-5 py-3 font-medium sm:px-6">{reviewBy === "week" ? weekLabel(r.key) : monthLabel(r.key, true)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.entries}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted">{r.avgMood?.toFixed(1) ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted">{r.avgChecklist === null ? "—" : `${r.avgChecklist.toFixed(1)}/${CHECKLIST.length}`}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.adherencePct === null ? "—" : `${Math.round(r.adherencePct)}%`}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <span className="text-profit">{r.greenDays}</span>
                      <span className="text-faint"> / </span>
                      <span className="text-loss">{r.redDays}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted">{r.mistakes}</td>
                    <td className={cn("px-5 py-3 text-right font-semibold tabular-nums sm:px-6", r.pnl > 0 ? "text-profit" : r.pnl < 0 ? "text-loss" : "text-muted")}>{formatSignedCurrency(r.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
