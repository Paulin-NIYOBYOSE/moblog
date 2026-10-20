"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { computeMetrics, equityCurve, METRIC_HELP } from "@/lib/replay/analytics";
import type { ControllerSnapshot } from "@/lib/replay/controller";
import { formatDuration } from "@/lib/replay/time";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPct, fmtR, money, tone } from "../format";
import { Ring, Sparkline, SplitBar, WinGauge } from "../analytics/mini";

function Tile({ label, value, sub, cls, help }: { label: string; value: string; sub?: string; cls?: string; help?: string }) {
  return (
    <div className="rounded-xl bg-[var(--term-chip)] px-3 py-2.5" title={help}>
      <div className="text-[10.5px] font-medium text-muted">{label}</div>
      <div className={cn("mt-0.5 text-[0.95rem] font-semibold tabular-nums", cls)}>{value}</div>
      {sub && <div className="text-[10.5px] tabular-nums text-faint">{sub}</div>}
    </div>
  );
}

/** Session stats slide-over (FX Replay style). */
export default function StatsDrawer({ snap, onClose, hideValues }: { snap: ControllerSnapshot; onClose: () => void; hideValues: boolean }) {
  const s = snap.session.settings;
  const ccy = s.accountCurrency;
  const m = useMemo(() => computeMetrics(snap.trades, s.initialBalance), [snap.trades, s.initialBalance]);
  const curve = useMemo(() => equityCurve(snap.trades, s.initialBalance).map((p) => p.equity), [snap.trades, s.initialBalance]);
  const mask = (v: string) => (hideValues ? "••••" : v);
  const avgRR = m.avgWin !== null && m.avgLoss !== null && m.avgLoss !== 0 ? Math.abs(m.avgWin / m.avgLoss) : null;

  return (
    <aside className="flex h-full min-h-0 flex-col" aria-label="Session stats" data-testid="stats-drawer">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div>
          <h2 className="text-[1.15rem] font-bold tracking-tight">Stats</h2>
          <p className="text-[11px] text-muted">Closed trades in this session · {m.total} trade{m.total === 1 ? "" : "s"}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close stats">
          <X className="h-4.5 w-4.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        <section className="rounded-2xl border border-border p-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium text-muted">Net P&amp;L</div>
              <div className={cn("text-2xl font-bold tabular-nums tracking-tight", !hideValues && tone(m.netPnl))}>{mask(money(m.netPnl, ccy, { signed: true }))}</div>
            </div>
            <div className="text-right text-[11px] text-muted">
              <div className={cn("text-sm font-semibold", tone(m.returnPct))}>{fmtPct(m.returnPct, 2, true)}</div>
              return
            </div>
          </div>
          <div className="mt-2">
            <Sparkline values={curve} base={s.initialBalance} height={70} />
          </div>
          <div className="mt-1 flex justify-between text-[10.5px] text-faint">
            <span>Balance {mask(money(snap.balance, ccy))}</span>
            <span>Equity {mask(money(snap.equity, ccy))}</span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <section className="flex flex-col items-center rounded-2xl border border-border p-3" title={METRIC_HELP.winRate}>
            <div className="self-start text-[11px] font-medium text-muted">Win rate</div>
            <WinGauge wins={m.wins} losses={m.losses} breakeven={m.breakeven} size={118} />
            <div className="-mt-3 text-lg font-bold tabular-nums">{fmtPct(m.winRate)}</div>
            <div className="mt-0.5 flex gap-2 text-[10.5px] font-semibold tabular-nums">
              <span className="text-profit">{m.wins}W</span>
              <span className="text-info">{m.breakeven}BE</span>
              <span className="text-loss">{m.losses}L</span>
            </div>
          </section>
          <section className="flex flex-col rounded-2xl border border-border p-3" title={METRIC_HELP.profitFactor}>
            <div className="text-[11px] font-medium text-muted">Profit factor</div>
            <div className="mt-1 flex items-center gap-2">
              <Ring value={m.grossProfit} rest={m.grossLoss} size={56} />
              <div className="text-lg font-bold tabular-nums">{m.profitFactor !== null ? fmtNum(m.profitFactor) : m.profitFactorNote === "no-losses" ? "∞" : "—"}</div>
            </div>
            <div className="mt-auto pt-2 text-[10.5px] tabular-nums text-faint">
              {mask(money(m.grossProfit, ccy))} / {mask(money(m.grossLoss, ccy))}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-border p-3">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted">
            <span>Avg win / avg loss</span>
            <span className="font-semibold text-foreground">{avgRR !== null ? `${fmtNum(avgRR)} : 1` : "—"}</span>
          </div>
          <div className="my-2">
            <SplitBar left={m.avgWin ?? 0} right={m.avgLoss ?? 0} />
          </div>
          <div className="flex justify-between text-xs font-semibold tabular-nums">
            <span className="text-profit">{mask(money(m.avgWin, ccy))}</span>
            <span className="text-loss">{mask(money(m.avgLoss, ccy))}</span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Tile label="Expectancy" value={fmtR(m.expectancyR)} sub={hideValues ? undefined : `${money(m.expectancyMoney, ccy, { signed: true })} / trade`} cls={tone(m.expectancyR)} help={METRIC_HELP.expectancyR} />
          <Tile label="Total R" value={fmtR(m.totalR, 1)} sub={`${m.validR} with a stop`} cls={tone(m.totalR)} help={METRIC_HELP.rMultiple} />
          <Tile label="Max drawdown" value={mask(money(snap.maxDrawdown, ccy))} sub={fmtPct(snap.maxDrawdownPct, 2)} cls={snap.maxDrawdown > 0 ? "text-loss" : undefined} help="Largest peak-to-trough fall of equity, marked to market at each candle close." />
          <Tile label="Open risk" value={mask(money(snap.openRisk, ccy))} sub={snap.unprotected ? `${snap.unprotected} without a stop` : "at current stops"} cls={snap.unprotected ? "text-warning" : undefined} />
          <Tile label="Largest win" value={mask(money(m.largestWin, ccy))} cls="text-profit" />
          <Tile label="Largest loss" value={mask(money(m.largestLoss, ccy))} cls="text-loss" />
          <Tile label="Longs" value={`${m.long.count} · ${fmtPct(m.long.winRate, 0)}`} sub={hideValues ? undefined : money(m.long.net, ccy, { signed: true })} />
          <Tile label="Shorts" value={`${m.short.count} · ${fmtPct(m.short.winRate, 0)}`} sub={hideValues ? undefined : money(m.short.net, ccy, { signed: true })} />
          <Tile label="Avg hold time" value={m.avgHoldingSeconds !== null ? formatDuration(m.avgHoldingSeconds) : "—"} />
          <Tile label="Streaks" value={`${m.maxConsecWins}W / ${m.maxConsecLosses}L`} help={METRIC_HELP.consec} />
        </div>
        {m.total > 0 && m.total < 30 && <p className="text-[11px] leading-snug text-muted">With fewer than ~30 trades these figures swing widely from a single result.</p>}
        <Link href={`/replay/analytics?session=${snap.session.id}`} className="flex items-center justify-center gap-1.5 rounded-full border border-border py-2 text-sm font-semibold hover:bg-surface-2">
          Full analytics <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </aside>
  );
}
