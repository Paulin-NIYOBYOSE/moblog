"use client";

import { ArrowDownRight, ArrowUpRight, ExternalLink, Plus } from "lucide-react";
import type { Trade } from "@/lib/types";
import { cn, formatCurrency, formatR, formatSignedCurrency, formatSignedPercent, isClosed, tradesWithRunningBalance } from "@/lib/utils";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
    <div id="journal" className="rounded-2xl border border-border bg-card scroll-mt-20 overflow-hidden">
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
        <div className="px-5 pb-8 pt-4 text-center">
          <p className="text-sm text-muted">No trades logged yet.</p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
          >
            <Plus className="h-4 w-4" /> Log your first trade
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(t.openDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {t.closeDate ? formatDate(t.closeDate) : <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">Open</span>}
                    </td>
                    <td className="px-4 py-3 font-medium">{t.pair}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: t.direction === "LONG" ? "var(--profit-soft)" : "var(--loss-soft)",
                          color: t.direction === "LONG" ? "var(--profit)" : "var(--loss)",
                        }}
                      >
                        {t.direction === "LONG" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {t.direction === "LONG" ? "Long" : "Short"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{t.exitLogic || "—"}</td>
                    <td className={cn("whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums", positive ? "text-profit" : "text-loss")}>
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
      )}
    </div>
  );
}
