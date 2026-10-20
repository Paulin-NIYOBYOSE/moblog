"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, BarChart3, Info, Layers } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardHeader } from "@/components/ui/Card";
import MultiSelect from "@/components/ui/MultiSelect";
import SegmentedControl from "@/components/ui/SegmentedControl";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ReplayNav, { ReplayFooter } from "@/components/replay/ReplayNav";
import VirtualRows from "@/components/replay/VirtualRows";
import { fmtPct, fmtR, money, tone } from "@/components/replay/format";
import { ActivityChart, Breakdowns, CumulativeRChart, DrawdownNote, EquityAndDrawdown, LongShort, MonthlyReturns, RDistributionChart, RollingWinRateChart, type Drill } from "@/components/replay/analytics/Charts";
import TradeExplorer from "@/components/replay/analytics/TradeExplorer";
import { CumulativePnl, DailyPnl, KpiStrip, PnlCalendar } from "@/components/replay/analytics/Dashboard";
import { computeMetrics, dailyPerformance, enrichTrades, filterTrades, METRIC_HELP, sortByExit, type AnalyticsFilter, type AnalyticsTrade } from "@/lib/replay/analytics";
import { formatDuration, formatInTz, fromInputValue, TIMEFRAMES } from "@/lib/replay/time";
import type { Timeframe } from "@/lib/replay/types";
import { useSessions } from "@/lib/replay/useReplayData";
import { cn } from "@/lib/utils";

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

const TRADE_COLS = "grid grid-cols-[8rem_minmax(7rem,1fr)_4.5rem_4rem_5.5rem_6rem_4rem_5rem] items-center gap-2 px-3";

function AnalyticsInner() {
  const params = useSearchParams();
  const { sessions, loading } = useSessions("analytics");
  const requested = params.get("session");
  const [selected, setSelected] = useState<string[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [strategies, setStrategies] = useState<string[]>([]);
  const [setups, setSetups] = useState<string[]>([]);
  const [tfs, setTfs] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");
  /** Several sessions: one shared account (default) or each session's own account summed. */
  const [balanceMode, setBalanceMode] = useState<"one" | "sum">("one");
  const [oneBalanceDraft, setOneBalanceDraft] = useState<string | null>(null);
  const [be, setBe] = useState(0);
  const [explore, setExplore] = useState<AnalyticsTrade | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const drillTo = (d: Drill) => {
    setDrill(d);
    requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Default to ONE session (the requested or most recent) — combining is explicit.
  const sessionIds = selected ?? (requested && sessions.some((s) => s.id === requested) ? [requested] : sessions[0] ? [sessions[0].id] : []);
  const chosen = sessions.filter((s) => sessionIds.includes(s.id));

  const allTrades = useMemo(() => chosen.flatMap((s) => enrichTrades(s.ledger, s.journal, s.strategy, s.name)), [chosen]);
  const filter = useMemo<AnalyticsFilter>(
    () => ({
      from: from ? fromInputValue(from, "UTC") : null,
      to: to ? (fromInputValue(to, "UTC") ?? 0) + 86_399 : null,
      symbols,
      strategies,
      setups,
      timeframes: tfs as Timeframe[],
      side,
      tags,
    }),
    [from, to, symbols, strategies, setups, tfs, side, tags],
  );
  const trades = useMemo(() => sortByExit(filterTrades(allTrades, filter)), [allTrades, filter]);
  const sumBalance = chosen.reduce((s, x) => s + x.settings.initialBalance, 0);
  // One account defaults to the first selected session's starting balance; the user can type another.
  const typedOne = oneBalanceDraft !== null ? Number(oneBalanceDraft) : NaN;
  const oneBalance = Number.isFinite(typedOne) && typedOne > 0 ? typedOne : (chosen[0]?.settings.initialBalance ?? 0);
  const initialBalance = chosen.length <= 1 ? (chosen[0]?.settings.initialBalance ?? 0) : balanceMode === "sum" ? sumBalance : oneBalance;
  const currencies = Array.from(new Set(chosen.map((s) => s.settings.accountCurrency)));
  const ccy = currencies[0] ?? "USD";
  const m = useMemo(() => computeMetrics(trades, initialBalance, be), [trades, initialBalance, be]);
  const days = useMemo(() => dailyPerformance(trades, be), [trades, be]);
  const open = chosen.reduce((s, x) => s + x.summary.openPositions, 0);

  const uniq = (xs: string[]) => Array.from(new Set(xs)).sort().map((v) => ({ value: v, label: v }));
  const symbolOpts = uniq(allTrades.map((t) => t.symbol));
  const strategyOpts = uniq(allTrades.map((t) => t.strategy));
  const setupOpts = uniq(allTrades.map((t) => t.setup));
  const tagOpts = uniq(allTrades.flatMap((t) => t.tags));
  const tfOpts = TIMEFRAMES.filter((tf) => allTrades.some((t) => t.timeframe === tf)).map((v) => ({ value: v, label: v }));
  const filtersActive = Boolean(from || to || symbols.length || strategies.length || setups.length || tfs.length || tags.length || side !== "all");

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (!sessions.length) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title="No sessions yet" description="Analytics are computed from the trades you take in replay sessions." action={<Link href="/replay" className="btn btn-primary">Go to sessions</Link>} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* One filter row scopes everything below. */}
      <Card padding="sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Sessions</label>
            <MultiSelect
              value={sessionIds}
              onChange={(v) => setSelected(v)}
              options={sessions.map((s) => ({ value: s.id, label: `${s.name} (${s.ledger.length})` }))}
              placeholder={chosen.length === 1 ? chosen[0].name : `${chosen.length} sessions`}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Exit from</label>
            <input type="date" className="input !py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Exit date from (UTC)" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Exit to</label>
            <input type="date" className="input !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Exit date to (UTC)" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Instrument</label>
            <MultiSelect value={symbols} onChange={setSymbols} options={symbolOpts} placeholder="All" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Strategy</label>
            <MultiSelect value={strategies} onChange={setStrategies} options={strategyOpts} placeholder="All" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Setup</label>
            <MultiSelect value={setups} onChange={setSetups} options={setupOpts} placeholder="All" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Timeframe</label>
            <MultiSelect value={tfs} onChange={setTfs} options={tfOpts} placeholder="All" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Tags</label>
            <MultiSelect value={tags} onChange={setTags} options={tagOpts} placeholder="Any" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">Direction</label>
            <SegmentedControl
              className="w-full [&>button]:flex-1"
              value={side}
              onChange={setSide}
              options={[
                { value: "all", label: "All" },
                { value: "buy", label: "Long" },
                { value: "sell", label: "Short" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
              Breakeven band <Help text="Trades with |R| at or below this count as breakeven instead of a win or loss. 0 = classify strictly by net P&L." />
            </label>
            <select className="input !py-1.5" value={be} onChange={(e) => setBe(Number(e.target.value))}>
              {[0, 0.05, 0.1, 0.2].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "Off" : `±${v}R`}
                </option>
              ))}
            </select>
          </div>
          {filtersActive && (
            <div className="flex items-end">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setSymbols([]);
                  setStrategies([]);
                  setSetups([]);
                  setTfs([]);
                  setTags([]);
                  setSide("all");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </Card>

      {chosen.length > 1 && (
        <div className="rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-info" data-testid="combine-balance">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex items-center gap-2 font-medium">
              <Layers className="h-4 w-4 shrink-0" /> Combining {chosen.length} sessions — balance:
            </span>
            <SegmentedControl
              value={balanceMode}
              onChange={setBalanceMode}
              options={[
                { value: "one", label: "One account" },
                { value: "sum", label: "Each session's own (summed)" },
              ]}
            />
            {balanceMode === "one" && (
              <label className="flex items-center gap-1.5 text-foreground">
                <span className="text-xs text-muted">Starting balance</span>
                <input
                  type="number"
                  min={1}
                  step={100}
                  className="input !h-8 !w-32 !py-0 text-sm tabular-nums"
                  value={oneBalanceDraft ?? String(oneBalance)}
                  onChange={(e) => setOneBalanceDraft(e.target.value)}
                  aria-label="Starting balance of the one shared account"
                  data-testid="one-balance"
                />
                <span className="text-xs text-muted">{ccy}</span>
              </label>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-info/90">
            {balanceMode === "one"
              ? `All trades from these sessions run on one ${money(oneBalance, ccy)} account, in the order they closed — how the strategy behaves as a single account. Each trade's P&L is as recorded in its session (sized on that session's balance); returns and drawdown are measured on this one balance.`
              : `Each session keeps its own account; returns and drawdown use the sessions' combined starting balance of ${money(sumBalance, ccy)}. Trades are ordered by their historical exit time.`}{" "}
            R-based metrics are comparable either way.
            {currencies.length > 1 && <strong> Sessions use different account currencies ({currencies.join(", ")}) — money totals are not meaningful; rely on R.</strong>}
          </p>
        </div>
      )}
      {(m.ambiguousExits > 0 || m.approxConversion > 0 || open > 0) && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-2.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="space-x-2">
            {m.ambiguousExits > 0 && <span>{m.ambiguousExits} exit(s) had SL and TP in the same candle — the stop was assumed first.</span>}
            {m.approxConversion > 0 && <span>{m.approxConversion} trade(s) use a fixed, approximate currency conversion.</span>}
            {open > 0 && <span>{open} open position(s) are excluded until closed.</span>}
          </span>
        </div>
      )}

      {trades.length === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title={allTrades.length ? "No trades match these filters" : "No closed trades in this selection"}
            description={allTrades.length ? "Clear or widen the filters." : "Open the session, step through the replay and close a few trades — every metric here is computed from them."}
            action={chosen[0] && !allTrades.length ? <Link href={`/replay/session/${chosen[0].id}/chart`} className="btn btn-primary">Open session</Link> : undefined}
          />
        </Card>
      ) : (
        <>
          {m.total < 30 && (
            <p className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-xs text-muted" data-testid="sample-warning">
              Sample size: {m.total} closed trade{m.total === 1 ? "" : "s"}. With fewer than ~30 trades, win rate, expectancy and profit factor swing widely from a single result — treat them as
              early impressions, not evidence of an edge. Backtest results never guarantee future returns.
            </p>
          )}
          <KpiStrip m={m} ccy={ccy} />
          <div className="grid gap-5 xl:grid-cols-2">
            <CumulativePnl days={days} ccy={ccy} trades={trades} onDrill={drillTo} />
            <DailyPnl days={days} ccy={ccy} trades={trades} onDrill={drillTo} />
          </div>
          <MonthlyReturns trades={trades} initialBalance={initialBalance} ccy={ccy} onDrill={drillTo} />
          <PnlCalendar days={days} ccy={ccy} trades={trades} onDrill={drillTo} />

          <Card>
            <CardHeader icon={BarChart3} title="All metrics" subtitle="Hover the ⓘ for definitions. Every figure is computed from the filtered closed trades." />
            <dl className="grid gap-x-6 gap-y-1.5 text-[0.82rem] sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["Total trades", String(m.total)],
                  ["Winning / losing / breakeven", `${m.wins} / ${m.losses} / ${m.breakeven}`],
                  ["Loss rate", fmtPct(m.lossRate), METRIC_HELP.lossRate],
                  ["Gross profit", money(m.grossProfit, ccy), METRIC_HELP.grossProfit],
                  ["Gross loss", money(m.grossLoss, ccy), METRIC_HELP.grossLoss],
                  ["Average win", money(m.avgWin, ccy), METRIC_HELP.avgWin],
                  ["Average loss", money(m.avgLoss, ccy), METRIC_HELP.avgLoss],
                  ["Average R", fmtR(m.avgR), METRIC_HELP.avgR],
                  ["Median R", fmtR(m.medianR), METRIC_HELP.medianR],
                  ["Expectancy (money)", money(m.expectancyMoney, ccy, { signed: true }), METRIC_HELP.expectancyMoney],
                  ["Largest win", money(m.largestWin, ccy), METRIC_HELP.largest],
                  ["Largest loss", money(m.largestLoss, ccy), METRIC_HELP.largest],
                  ["Max consecutive wins", String(m.maxConsecWins), METRIC_HELP.consec],
                  ["Max consecutive losses", String(m.maxConsecLosses), METRIC_HELP.consec],
                  ["Average holding time", m.avgHoldingSeconds !== null ? formatDuration(m.avgHoldingSeconds) : "—", METRIC_HELP.holding],
                  ["Max drawdown %", fmtPct(m.maxDrawdownPct, 2), METRIC_HELP.maxDrawdownPct],
                  ["Long trades", `${m.long.count} · ${fmtPct(m.long.winRate, 0)} · ${money(m.long.net, ccy, { signed: true })}`],
                  ["Short trades", `${m.short.count} · ${fmtPct(m.short.winRate, 0)} · ${money(m.short.net, ccy, { signed: true })}`],
                  ["Commission paid", money(m.totalCommission, ccy)],
                ] as [string, string, string?][]
              ).map(([k, v, h]) => (
                <div key={k} className="flex items-center justify-between gap-3 border-b border-border/60 py-1">
                  <dt className="flex items-center gap-1 text-muted">
                    {k} {h && <Help text={h} />}
                  </dt>
                  <dd className="font-medium tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3">
              <DrawdownNote peakT={m.ddPeakT} troughT={m.ddTroughT} recoveryT={m.ddRecoveryT} />
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <EquityAndDrawdown trades={trades} initialBalance={initialBalance} ccy={ccy} />
            <div className="grid gap-5">
              <CumulativeRChart trades={trades} />
              <RDistributionChart trades={trades} onDrill={drillTo} />
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_2fr]">
            <LongShort trades={trades} ccy={ccy} be={be} />
            <Breakdowns trades={trades} ccy={ccy} be={be} onDrill={drillTo} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <RollingWinRateChart trades={trades} />
            <ActivityChart trades={trades} ccy={ccy} onDrill={drillTo} />
          </div>

          <Card padding="none">
            <div className="scroll-mt-4 px-4 pt-4 sm:px-5" ref={tableRef}>
              <CardHeader
                title={drill ? `Trades — ${drill.label} (${trades.filter((t) => drill.ids.has(t.id)).length})` : `Trades (${trades.length})`}
                subtitle="Click a trade to inspect it on the chart. Click any chart bar, heatmap month or breakdown row above to list its trades here."
                action={
                  drill ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDrill(null)} data-testid="clear-drill">
                      Show all trades
                    </button>
                  ) : undefined
                }
              />
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <VirtualRows
                  items={[...(drill ? trades.filter((t) => drill.ids.has(t.id)) : trades)].reverse()}
                  rowHeight={34}
                  height={Math.min(480, 40 + trades.length * 34)}
                  header={
                    <div className={cn(TRADE_COLS, "sticky top-0 z-10 border-y border-border bg-surface-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted")}>
                      <span>Exit</span>
                      <span>Session · strategy</span>
                      <span>Side</span>
                      <span>Symbol</span>
                      <span className="text-right">R</span>
                      <span className="text-right">Net</span>
                      <span>Reason</span>
                      <span className="text-right">Held</span>
                    </div>
                  }
                  renderRow={(t) => (
                    <button type="button" onClick={() => setExplore(t)} className={cn(TRADE_COLS, "h-full w-full border-b border-border/60 text-left text-xs hover:bg-surface-2")} data-testid="analytics-trade-row">
                      <span className="tabular-nums text-muted">{formatInTz(t.exitT, "UTC", "short")}</span>
                      <span className="truncate">
                        {t.sessionName} <span className="text-faint">· {t.strategy}</span>
                      </span>
                      <span className={t.side === "buy" ? "text-profit" : "text-loss"}>{t.side === "buy" ? "▲ Long" : "▼ Short"}</span>
                      <span>{t.symbol}</span>
                      <span className={cn("text-right tabular-nums", tone(t.rMultiple))}>{fmtR(t.rMultiple)}</span>
                      <span className={cn("text-right font-semibold tabular-nums", tone(t.netPnl))}>{money(t.netPnl, ccy, { signed: true })}</span>
                      <span className="uppercase text-muted">
                        {t.exitReason}
                        {t.ambiguous ? "*" : ""}
                      </span>
                      <span className="text-right tabular-nums text-muted">{formatDuration(t.holdingSeconds)}</span>
                    </button>
                  )}
                />
              </div>
            </div>
          </Card>
        </>
      )}

      <TradeExplorer trade={explore} session={explore ? sessions.find((s) => s.id === explore.sessionId) ?? null : null} journal={explore ? sessions.find((s) => s.id === explore.sessionId)?.journal[explore.id] : undefined} onClose={() => setExplore(null)} />
    </div>
  );
}

export default function ReplayAnalyticsPage() {
  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <BarChart3 className="h-3 w-3" /> Replay · performance
          </>
        }
        title="Replay analytics"
        subtitle="Computed only from closed trades in the sessions you select. Past results do not guarantee future performance."
      />
      <ReplayNav />
      <Suspense fallback={<Skeleton className="h-72" />}>
        <AnalyticsInner />
      </Suspense>
      <ReplayFooter />
    </div>
  );
}
