"use client";

import { useState } from "react";
import { BarChart3, Landmark, PieChart, Target, TrendingDown, TrendingUp } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import SegmentedControl from "@/components/ui/SegmentedControl";
import StatTile from "@/components/ui/StatTile";
import { formatMoney, generalSavings, monthOf, monthSummary, monthTitle, notebookMonths, savedForItems, spendingByCategory, type MonthSummary } from "@/lib/notebook";
import type { NotebookApi } from "@/lib/useNotebook";
import { cn } from "@/lib/utils";
import { CurrencySetup } from "./shared";

// Where a month's income went, in the chart palette's fixed order.
const SERIES = [
  { key: "spent", label: "Spent", swatch: "bg-chart-1" },
  { key: "saved", label: "Kill list", swatch: "bg-chart-2" },
  { key: "general", label: "General savings", swatch: "bg-chart-3" },
] as const;

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

/** Your money over time: totals, where each month's income went, and what you spend on. */
export default function AnalyticsTab({ nb, today }: { nb: NotebookApi; today: string }) {
  const d = nb.data!;
  const [range, setRange] = useState<"month" | "all">("all");
  if (!d.settings.currency) return <CurrencySetup nb={nb} />;

  const currency = d.settings.currency;
  const money = (v: number) => formatMoney(v, currency);
  const months = notebookMonths(d, today);
  const rows = months
    .map((month) => ({ month, s: monthSummary(d.months.find((m) => m.month === month) ?? null, d.entries, d, month, today) }))
    .filter(({ s }) => s.receivedIncome || s.spent || s.saved || s.plannedSpending)
    .reverse();
  const income = rows.reduce((t, r) => t + r.s.receivedIncome, 0);
  const spent = rows.reduce((t, r) => t + r.s.spent, 0);
  const general = generalSavings(d, today);
  const goal = d.settings.generalGoal;
  const current = monthOf(today);
  const categories = spendingByCategory(d, range === "month" ? current : months[0], current);
  const categoryTotal = categories.reduce((t, c) => t + c.spent, 0);

  if (!rows.length)
    return (
      <Card>
        <EmptyState icon={BarChart3} title="Nothing to show yet" description="Plan a month in the budget, then write down your income and spending — your months show up here." />
      </Card>
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Income" icon={TrendingUp} accent="profit">
          <p className="mt-2 font-display text-2xl tabular-nums" data-testid="analytics-income">
            {money(income)}
          </p>
          <p className="text-xs text-muted">
            over {rows.length} month{rows.length === 1 ? "" : "s"}
          </p>
        </StatTile>
        <StatTile label="Spent" icon={TrendingDown} accent="warning">
          <p className="mt-2 font-display text-2xl tabular-nums" data-testid="analytics-spent">
            {money(spent)}
          </p>
          <p className="text-xs text-muted">{pct(spent, income)} of your income</p>
        </StatTile>
        <StatTile label="General" icon={Landmark} accent="gold">
          <p className="mt-2 font-display text-2xl tabular-nums">{money(general.balance)}</p>
          <p className="text-xs text-muted">general savings{goal ? ` · ${pct(Math.max(0, general.balance), goal)} of your goal` : ""}</p>
        </StatTile>
        <StatTile label="Kill list" icon={Target} accent="accent">
          <p className="mt-2 font-display text-2xl tabular-nums">{money(savedForItems(d.entries))}</p>
          <p className="text-xs text-muted">saved for things to buy</p>
        </StatTile>
      </div>

      <Card>
        <CardHeader icon={BarChart3} title="Month by month" subtitle="Where each month's income went — newest first." />
        <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
          {SERIES.map((x) => (
            <li key={x.key} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-[3px]", x.swatch)} /> {x.label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-surface-3" /> Kept for the plan
          </li>
        </ul>
        <ul className="space-y-5" data-testid="analytics-months">
          {rows.map(({ month, s }) => (
            <MonthRow key={month} month={month} s={s} money={money} currency={currency} />
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          icon={PieChart}
          title="Where your money goes"
          subtitle={categoryTotal ? `${money(categoryTotal)} spent ${range === "month" ? "this month" : "in all"}` : "Spending by category"}
          action={
            <SegmentedControl
              options={[
                { value: "month", label: "Month" },
                { value: "all", label: "All" },
              ]}
              value={range}
              onChange={setRange}
            />
          }
        />
        {categories.length ? (
          <ul className="space-y-3" data-testid="analytics-categories">
            {categories.map((c) => (
              <li key={c.name} title={`${c.name}: ${money(c.spent)}`}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {money(c.spent)} <span className="text-xs text-faint">{pct(c.spent, categoryTotal)}</span>
                  </span>
                </div>
                <div className="h-2 rounded-[4px] bg-chart-1" style={{ width: `${(c.spent / categories[0].spent) * 100}%` }} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing spent {range === "month" ? "this month" : "yet"}.</p>
        )}
      </Card>
    </div>
  );
}

/** One month: a bar of where its income went, labelled underneath. */
function MonthRow({ month, s, money, currency }: { month: string; s: MonthSummary; money: (v: number) => string; currency: string }) {
  const parts = { spent: s.spent, saved: Math.max(0, s.saved), general: Math.max(0, s.toGeneral ?? 0) };
  const used = parts.spent + parts.saved + parts.general;
  const scale = Math.max(s.receivedIncome, used);
  const kept = Math.max(0, s.receivedIncome - used);
  return (
    <li>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium">
          {monthTitle(month)}
          {!s.closed && <span className="font-normal text-faint"> · so far</span>}
        </span>
        <span className="text-xs text-muted">
          Income <span className="font-semibold tabular-nums text-foreground">{money(s.receivedIncome)}</span>
        </span>
      </div>
      {scale > 0 ? (
        <div className="flex h-3 gap-[2px]">
          {SERIES.map((x) =>
            parts[x.key] > 0 ? <div key={x.key} className={cn("h-full rounded-[4px]", x.swatch)} style={{ width: `${(parts[x.key] / scale) * 100}%` }} title={`${x.label}: ${money(parts[x.key])}`} /> : null,
          )}
          {kept > 0 && <div className="h-full rounded-[4px] bg-surface-3" style={{ width: `${(kept / scale) * 100}%` }} title={`Kept for the plan: ${money(kept)}`} />}
        </div>
      ) : (
        <div className="h-3 rounded-[4px] bg-surface-3" />
      )}
      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted">
        <span>
          Spent <span className="font-semibold tabular-nums text-foreground">{money(s.spent)}</span>
          {s.plannedSpending > 0 && ` of ${money(s.plannedSpending)} planned`}
        </span>
        <span>
          Kill list <span className="font-semibold tabular-nums text-foreground">{money(s.saved)}</span>
        </span>
        <span>
          General savings{" "}
          {s.toGeneral === null ? (
            "— no income written down"
          ) : (
            <span className={cn("font-semibold tabular-nums", s.toGeneral < 0 ? "text-loss" : "text-foreground")}>{formatMoney(s.toGeneral, currency, { signed: true })}</span>
          )}
        </span>
      </p>
    </li>
  );
}
