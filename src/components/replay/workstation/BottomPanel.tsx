"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, NotebookPen, Scale, X } from "lucide-react";
import { computeMetrics, METRIC_HELP } from "@/lib/replay/analytics";
import type { ControllerSnapshot, NewCommand } from "@/lib/replay/controller";
import { labelOf, type ApplyResult } from "@/lib/replay/engine";
import { formatPrice } from "@/lib/replay/instruments";
import { formatDuration, formatInTz } from "@/lib/replay/time";
import type { JournalEntry, PendingOrder, Position, TradeRecord } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import { fmtPct, fmtR, money, parsePrice, tone } from "../format";
import VirtualRows from "../VirtualRows";

type Tab = "positions" | "orders" | "history" | "journal" | "performance" | "notes" | "log";

function SideTag({ side }: { side: "buy" | "sell" }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-bold uppercase", side === "buy" ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss")}>
      {side === "buy" ? "▲ Long" : "▼ Short"}
    </span>
  );
}

/** Price cell that edits in place; commits on Enter or blur. Empty clears. */
function PriceEdit({ value, digits, onCommit, label }: { value: number | null; digits: number; onCommit: (v: number | null) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value !== null ? value.toFixed(digits) : "");
  const commit = () => {
    if (draft === null) return;
    const v = draft.trim() === "" ? null : parsePrice(draft);
    setDraft(null);
    if (draft.trim() !== "" && v === null) return;
    if (v !== value) onCommit(v);
  };
  return (
    <input
      className="w-[5.6rem] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums outline-none hover:border-border focus:border-accent focus:bg-surface"
      value={shown}
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(null);
      }}
      aria-label={label}
    />
  );
}

export default function BottomPanel({
  snap,
  onSubmit,
  onOpenJournal,
  onNotes,
}: {
  snap: ControllerSnapshot;
  onSubmit: (cmd: NewCommand) => ApplyResult;
  onOpenJournal: (tradeId: string) => void;
  onNotes: (notes: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("positions");
  const { spec, session } = snap;
  const ccy = session.settings.accountCurrency;
  const tz = session.displayTimezone;
  const d = spec.digits;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "positions", label: "Positions", count: snap.positions.length },
    { id: "orders", label: "Orders", count: snap.orders.length },
    { id: "history", label: "History", count: snap.trades.length },
    { id: "journal", label: "Journal" },
    { id: "performance", label: "Performance" },
    { id: "notes", label: "Notes" },
    { id: "log", label: "Log" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2 no-scrollbar" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative shrink-0 px-2.5 py-2 text-xs font-medium transition-colors",
              tab === t.id ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="ml-1 rounded bg-surface-3 px-1 text-[10px] tabular-nums">{t.count}</span>}
            {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto text-xs">
        {tab === "positions" && <PositionsTab snap={snap} onSubmit={onSubmit} onOpenJournal={onOpenJournal} />}
        {tab === "orders" && <OrdersTab orders={snap.orders} digits={d} onSubmit={onSubmit} tz={tz} />}
        {tab === "history" && <HistoryTab trades={snap.trades} digits={d} ccy={ccy} tz={tz} journal={session.journal} onOpenJournal={onOpenJournal} initialBalance={session.settings.initialBalance} />}
        {tab === "journal" && <JournalTab snap={snap} onOpenJournal={onOpenJournal} />}
        {tab === "performance" && <PerformanceTab snap={snap} />}
        {tab === "notes" && (
          <div className="h-full p-2">
            <textarea
              className="input h-full min-h-[80px] resize-none text-[0.8rem]"
              placeholder="Session notes — market regime, observations, rules to test…"
              value={session.notes}
              onChange={(e) => onNotes(e.target.value)}
              aria-label="Session notes"
            />
          </div>
        )}
        {tab === "log" && (
          <ul className="divide-y divide-border">
            {snap.log.length === 0 && <li className="px-3 py-6 text-center text-muted">No activity yet.</li>}
            {[...snap.log].reverse().map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-28 shrink-0 tabular-nums text-muted">{formatInTz(e.t, tz, "short")}</span>
                <span className={cn("w-14 shrink-0 text-[10px] font-semibold uppercase", e.kind === "reject" ? "text-loss" : "text-faint")}>{e.kind}</span>
                <span className="min-w-0 flex-1 truncate">{e.text}</span>
                {e.amount !== undefined && <span className={cn("tabular-nums", tone(e.amount))}>{money(e.amount, ccy, { signed: true })}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PositionsTab({ snap, onSubmit, onOpenJournal }: { snap: ControllerSnapshot; onSubmit: (c: NewCommand) => ApplyResult; onOpenJournal: (id: string) => void }) {
  const { spec, quote, session } = snap;
  const ccy = session.settings.accountCurrency;
  if (!snap.positions.length) return <p className="px-3 py-6 text-center text-muted">No open positions. Use the order ticket to place a trade.</p>;
  const unrealized = (p: Position) => {
    const exit = p.side === "buy" ? quote.bid : quote.ask;
    const dir = p.side === "buy" ? 1 : -1;
    return { exit, pips: ((exit - p.entryPrice) * dir) / spec.pipSize };
  };
  return (
    <table className="w-full min-w-[720px]">
      <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted">
        <tr className="border-b border-border">
          <th className="px-3 py-1.5 text-left font-semibold">Side</th>
          <th className="px-2 text-right font-semibold">Lots</th>
          <th className="px-2 text-right font-semibold">Entry</th>
          <th className="px-2 text-right font-semibold">Price</th>
          <th className="px-2 text-right font-semibold">Stop-loss</th>
          <th className="px-2 text-right font-semibold">Take-profit</th>
          <th className="px-2 text-right font-semibold">Pips</th>
          <th className="px-2 text-right font-semibold">P&amp;L</th>
          <th className="px-2 text-right font-semibold">Open R</th>
          <th className="px-3 text-right font-semibold">Actions</th>
        </tr>
      </thead>
      <tbody>
        {snap.positions.map((p) => {
          const u = unrealized(p);
          const pnl = snap.positionPnl[p.id];
          return (
            <tr key={p.id} className="border-b border-border/70" data-testid="position-row">
              <td className="px-3 py-1">
                <SideTag side={p.side} />
              </td>
              <td className="px-2 text-right tabular-nums">{p.lots.toFixed(2)}</td>
              <td className="px-2 text-right tabular-nums">{formatPrice(p.entryPrice, spec)}</td>
              <td className="px-2 text-right tabular-nums">{formatPrice(u.exit, spec)}</td>
              <td className="px-1 text-right">
                <PriceEdit value={p.sl} digits={spec.digits} label="Stop-loss" onCommit={(sl) => onSubmit({ type: "modify-position", positionId: p.id, sl })} />
              </td>
              <td className="px-1 text-right">
                <PriceEdit value={p.tp} digits={spec.digits} label="Take-profit" onCommit={(tp) => onSubmit({ type: "modify-position", positionId: p.id, tp })} />
              </td>
              <td className={cn("px-2 text-right tabular-nums", tone(u.pips))}>{u.pips.toFixed(1)}</td>
              <td className={cn("px-2 text-right tabular-nums", tone(pnl?.unrealized))}>
                {money(pnl?.unrealized, ccy, { signed: true })}
                <span className="ml-1 text-[10.5px] opacity-80">{fmtPct(pnl && snap.balance > 0 ? (pnl.unrealized / snap.balance) * 100 : null, 2, true)}</span>
              </td>
              <td className={cn("px-2 text-right tabular-nums", tone(pnl?.openR))}>
                {pnl?.openR !== null && pnl?.openR !== undefined ? fmtR(pnl.openR) : <span className="text-faint">no SL</span>}
              </td>
              <td className="px-3 py-1">
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm !px-1.5"
                    title="Move stop-loss to break-even (entry price)"
                    onClick={() => onSubmit({ type: "modify-position", positionId: p.id, sl: p.entryPrice })}
                  >
                    <Scale className="h-3.5 w-3.5" /> BE
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm !px-1.5"
                    title="Close half the position at market"
                    disabled={p.lots < 0.02}
                    onClick={() => onSubmit({ type: "close", positionId: p.id, lots: Math.floor((p.lots / 2) * 100) / 100 })}
                  >
                    ½
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm !px-1.5" title="Journal" onClick={() => onOpenJournal(p.id)}>
                    <NotebookPen className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="btn btn-danger btn-sm !px-2" onClick={() => onSubmit({ type: "close", positionId: p.id })} data-testid="close-position">
                    Close
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={10} className="px-3 py-1.5 text-[10.5px] text-faint">
            Drag the SL/TP lines on the chart or edit them here. Equity shown in {ccy}.
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function OrdersTab({ orders, digits, onSubmit, tz }: { orders: PendingOrder[]; digits: number; onSubmit: (c: NewCommand) => ApplyResult; tz: string }) {
  if (!orders.length) return <p className="px-3 py-6 text-center text-muted">No pending orders. Choose Limit or Stop in the ticket.</p>;
  return (
    <table className="w-full min-w-[620px]">
      <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted">
        <tr className="border-b border-border">
          <th className="px-3 py-1.5 text-left font-semibold">Type</th>
          <th className="px-2 text-right font-semibold">Lots</th>
          <th className="px-2 text-right font-semibold">Price</th>
          <th className="px-2 text-right font-semibold">Stop-loss</th>
          <th className="px-2 text-right font-semibold">Take-profit</th>
          <th className="px-2 text-left font-semibold">Placed</th>
          <th className="px-3 text-right font-semibold" />
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} className="border-b border-border/70">
            <td className="px-3 py-1">
              <span className={cn("font-semibold", o.type.startsWith("buy") ? "text-profit" : "text-loss")}>{labelOf(o.type)}</span>
            </td>
            <td className="px-2 text-right tabular-nums">{o.lots.toFixed(2)}</td>
            <td className="px-1 text-right">
              <PriceEdit value={o.price} digits={digits} label="Order price" onCommit={(price) => price !== null && onSubmit({ type: "modify-order", orderId: o.id, price })} />
            </td>
            <td className="px-1 text-right">
              <PriceEdit value={o.sl} digits={digits} label="Stop-loss" onCommit={(sl) => onSubmit({ type: "modify-order", orderId: o.id, sl })} />
            </td>
            <td className="px-1 text-right">
              <PriceEdit value={o.tp} digits={digits} label="Take-profit" onCommit={(tp) => onSubmit({ type: "modify-order", orderId: o.id, tp })} />
            </td>
            <td className="px-2 tabular-nums text-muted">{formatInTz(o.createdAt, tz, "short")}</td>
            <td className="px-3 text-right">
              <button type="button" className="btn btn-ghost btn-sm !px-1.5" onClick={() => onSubmit({ type: "cancel", orderId: o.id })}>
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const HISTORY_COLS = "grid grid-cols-[6.5rem_4.2rem_3rem_5rem_5rem_3rem_5.5rem_3.8rem_4rem_4rem_2rem] items-center gap-2 px-3";

function HistoryTab({
  trades,
  digits,
  ccy,
  tz,
  journal,
  onOpenJournal,
  initialBalance,
}: {
  trades: TradeRecord[];
  digits: number;
  ccy: string;
  tz: string;
  journal: Record<string, JournalEntry>;
  onOpenJournal: (id: string) => void;
  initialBalance: number;
}) {
  const rows = [...trades].reverse();
  // % gain/loss of each trade on the balance before it closed (exit order).
  const pctById = new Map<string, number>();
  let bal = initialBalance;
  for (const t of [...trades].sort((a, b) => a.exitT - b.exitT)) {
    pctById.set(t.id, bal > 0 ? (t.netPnl / bal) * 100 : 0);
    bal += t.netPnl;
  }
  return (
    <div className="min-w-[820px]">
      <VirtualRows
        items={rows}
        rowHeight={30}
        height="100%"
        className="h-full"
        header={
          <div className={cn(HISTORY_COLS, "sticky top-0 z-10 border-b border-border bg-card py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted")}>
            <span>Exit time</span>
            <span>Side</span>
            <span className="text-right">Lots</span>
            <span className="text-right">Entry</span>
            <span className="text-right">Exit</span>
            <span>Exit</span>
            <span className="text-right">Net</span>
            <span className="text-right">%</span>
            <span className="text-right">R</span>
            <span className="text-right">Held</span>
            <span />
          </div>
        }
        empty={<p className="px-3 py-6 text-center text-muted">Closed trades appear here.</p>}
        renderRow={(t) => (
          <div className={cn(HISTORY_COLS, "h-full border-b border-border/60")} data-testid="history-row">
            <span className="tabular-nums text-muted">{formatInTz(t.exitT, tz, "short")}</span>
            <span>
              <SideTag side={t.side} />
            </span>
            <span className="text-right tabular-nums">{t.lots.toFixed(2)}</span>
            <span className="text-right tabular-nums">{t.entryPrice.toFixed(digits)}</span>
            <span className="text-right tabular-nums">{t.exitPrice.toFixed(digits)}</span>
            <span className="text-[10px] font-semibold uppercase text-muted" title={t.ambiguous ? METRIC_HELP.ambiguous : undefined}>
              {t.exitReason}
              {t.ambiguous ? "*" : ""}
            </span>
            <span className={cn("text-right font-semibold tabular-nums", tone(t.netPnl))}>{money(t.netPnl, ccy, { signed: true })}</span>
            <span className={cn("text-right tabular-nums", tone(t.netPnl))}>{fmtPct(pctById.get(t.id) ?? null, 2, true)}</span>
            <span className={cn("text-right tabular-nums", tone(t.rMultiple))}>{fmtR(t.rMultiple)}</span>
            <span className="text-right tabular-nums text-muted">{formatDuration(t.holdingSeconds)}</span>
            <button type="button" onClick={() => onOpenJournal(t.id)} className={cn("justify-self-end rounded p-1 hover:bg-surface-2", journal[t.id] ? "text-accent" : "text-faint")} title="Journal" aria-label="Open journal for this trade">
              <NotebookPen className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      />
    </div>
  );
}

function JournalTab({ snap, onOpenJournal }: { snap: ControllerSnapshot; onOpenJournal: (id: string) => void }) {
  const items = [
    ...snap.positions.map((p) => ({ id: p.id, side: p.side, label: "Open", t: p.entryT, net: null as number | null })),
    ...[...snap.trades].reverse().map((t) => ({ id: t.id, side: t.side, label: t.exitReason.toUpperCase(), t: t.entryT, net: t.netPnl })),
  ];
  if (!items.length) return <p className="px-3 py-6 text-center text-muted">Trades you take will be listed here for journaling.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((it) => {
        const j = snap.session.journal[it.id];
        return (
          <li key={it.id} className="flex items-center gap-3 px-3 py-1.5">
            <SideTag side={it.side} />
            <span className="w-28 shrink-0 tabular-nums text-muted">{formatInTz(it.t, snap.session.displayTimezone, "short")}</span>
            <span className="w-12 shrink-0 text-[10px] font-semibold text-muted">{it.label}</span>
            <span className={cn("w-20 shrink-0 text-right tabular-nums", tone(it.net))}>{it.net === null ? "—" : money(it.net, snap.session.settings.accountCurrency, { signed: true })}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{j?.notes || j?.preTrade || <span className="text-faint">No notes</span>}</span>
            {j?.tags?.length ? <span className="hidden truncate text-[10.5px] text-faint sm:inline">{j.tags.map((t) => `#${t}`).join(" ")}</span> : null}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenJournal(it.id)}>
              <NotebookPen className="h-3.5 w-3.5" /> {j ? "Edit" : "Add"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PerformanceTab({ snap }: { snap: ControllerSnapshot }) {
  const s = snap.session.settings;
  const m = computeMetrics(snap.trades, s.initialBalance);
  const ccy = s.accountCurrency;
  const items: [string, string, string?][] = [
    ["Closed trades", String(m.total)],
    ["Win rate", fmtPct(m.winRate), m.winRate === null ? undefined : `${m.wins}W · ${m.losses}L · ${m.breakeven}BE`],
    ["Net P&L", money(m.netPnl, ccy, { signed: true }), fmtPct(m.returnPct, 2, true)],
    ["Profit factor", m.profitFactor !== null ? m.profitFactor.toFixed(2) : m.profitFactorNote === "no-losses" ? "No losses" : "—"],
    ["Expectancy", fmtR(m.expectancyR), money(m.expectancyMoney, ccy, { signed: true }) + " / trade"],
    ["Avg win / loss", `${money(m.avgWin, ccy)} / ${money(m.avgLoss, ccy)}`],
    ["Max drawdown (closed)", money(m.maxDrawdown, ccy), fmtPct(m.maxDrawdownPct, 2)],
    ["Streaks", `${m.maxConsecWins}W / ${m.maxConsecLosses}L`],
  ];
  return (
    <div className="p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(([label, value, sub]) => (
          <div key={label} className="rounded-lg border border-border px-2.5 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
            <div className="mt-0.5 text-sm font-semibold">{value}</div>
            {sub && <div className="text-[10.5px] text-muted">{sub}</div>}
          </div>
        ))}
      </div>
      <Link href={`/replay/analytics?session=${snap.session.id}`} className="btn btn-secondary btn-sm mt-3">
        <BarChart3 className="h-3.5 w-3.5" /> Full analytics for this session
      </Link>
    </div>
  );
}
