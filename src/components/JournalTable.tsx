"use client";

import { ArrowDownRight, ArrowUpRight, ExternalLink, Plus } from "lucide-react";
import { motion } from "motion/react";
import type { Trade, TradeWithBalance } from "@/lib/types";
import {
  cn,
  formatCurrency,
  formatR,
  formatSignedCurrency,
  formatSignedPercent,
  isClosed,
  tradesWithRunningBalance,
} from "@/lib/utils";
import Card from "./ui/Card";
import Badge from "./ui/Badge";
import EmptyState from "./ui/EmptyState";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function JournalRowCard({
  trade,
  onEdit,
  index,
}: {
  trade: TradeWithBalance;
  onEdit: (trade: Trade) => void;
  index: number;
}) {
  const closed = isClosed(trade);
  const positive = trade.pnl >= 0;

  return (
    <motion.button
      type="button"
      onClick={() => onEdit(trade)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.02 }}
      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-left transition-colors hover:border-accent/40"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{trade.pair}</span>
          <Badge tone={trade.direction === "LONG" ? "profit" : "loss"}>
            {trade.direction === "LONG" ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trade.direction === "LONG" ? "Long" : "Short"}
          </Badge>
          {!closed && <Badge tone="accent">Open</Badge>}
        </div>
        <span
          className={cn(
            "shrink-0 font-semibold tabular-nums",
            positive ? "text-profit" : "text-loss",
          )}
        >
          {closed ? formatSignedCurrency(trade.pnl) : "—"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
        <span>
          {formatDate(trade.openDate)}
          {trade.closeDate ? ` → ${formatDate(trade.closeDate)}` : ""}
        </span>
        {trade.exitLogic && <span>· {trade.exitLogic}</span>}
        {closed && <span>· ROI {formatSignedPercent(trade.roi)}</span>}
        {closed && <span>· {formatR(trade.rr)}</span>}
        {closed && <span>· Bal {formatCurrency(trade.balance)}</span>}
        {trade.chartUrl && (
          <a
            href={trade.chartUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-accent"
          >
            <ExternalLink className="h-3 w-3" /> Chart
          </a>
        )}
      </div>
    </motion.button>
  );
}

export default function JournalTable({
  trades,
  startingBalance,
  onEdit,
  onAdd,
}: {
  trades: Trade[];
  startingBalance: number;
  onEdit: (trade: Trade) => void;
  onAdd: () => void;
}) {
  const rows = tradesWithRunningBalance(trades, startingBalance);

  return (
    <Card id="journal" scrollMt padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <h3 className="text-sm font-semibold">Journal</h3>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-surface-2"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No trades logged yet."
          action={
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
            >
              <Plus className="h-4 w-4" /> Log your first trade
            </button>
          }
        />
      ) : (
        <>
          {/* Card list — mobile/tablet-portrait, no horizontal scroll */}
          <div className="space-y-2 px-4 pb-4 md:hidden">
            {rows.map((t, i) => (
              <JournalRowCard key={t.id} trade={t} onEdit={onEdit} index={i} />
            ))}
          </div>

          {/* Table — md and up */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">Open</th>
                  <th className="px-4 py-2.5 font-medium">Close</th>
                  <th className="px-4 py-2.5 font-medium">Pair</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Exit logic</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net P&L</th>
                  <th className="px-4 py-2.5 text-right font-medium">ROI</th>
                  <th className="px-4 py-2.5 text-right font-medium">R:R</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-4 py-2.5 text-center font-medium">Chart</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const closed = isClosed(t);
                  const positive = t.pnl >= 0;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onEdit(t)}
                      className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-2"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {formatDate(t.openDate)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {t.closeDate ? (
                          formatDate(t.closeDate)
                        ) : (
                          <Badge tone="accent">Open</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{t.pair}</td>
                      <td className="px-4 py-3">
                        <Badge tone={t.direction === "LONG" ? "profit" : "loss"}>
                          {t.direction === "LONG" ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {t.direction === "LONG" ? "Long" : "Short"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {t.exitLogic || "—"}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums",
                          positive ? "text-profit" : "text-loss",
                        )}
                      >
                        {closed ? formatSignedCurrency(t.pnl) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-muted">
                        {closed ? formatSignedPercent(t.roi) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-muted">
                        {closed ? formatR(t.rr) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                        {closed ? formatCurrency(t.balance) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {t.chartUrl ? (
                          <a
                            href={t.chartUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center justify-center text-muted hover:text-accent"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
