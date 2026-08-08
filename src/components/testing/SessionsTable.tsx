"use client";

import { Pencil, Plus, TestTube, Trash2, Upload } from "lucide-react";
import type { Session } from "@/lib/testing/types";
import { cn, formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SessionsTable({
  sessions,
  onUpload,
  onAddTrade,
  onEdit,
  onDelete,
  onCreate,
}: {
  sessions: Session[];
  onUpload: (session: Session) => void;
  onAddTrade: (session: Session) => void;
  onEdit: (session: Session) => void;
  onDelete: (session: Session) => void;
  onCreate: () => void;
}) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <h3 className="text-sm font-semibold">Sessions</h3>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-transform hover:opacity-95 active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" /> New session
        </button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={TestTube}
          title="No backtesting sessions yet."
          description="Create a session, then upload a CSV of trades or add them manually."
          action={
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
            >
              <Plus className="h-4 w-4" /> New session
            </button>
          }
        />
      ) : (
        <>
          {/* Card list — mobile */}
          <div className="space-y-2 px-4 pb-4 md:hidden">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-border bg-surface-2 px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-xs text-muted">
                      {s.pair} · {s.tradeCount ?? 0} trades
                    </p>
                  </div>
                  <span
                    className="shrink-0 font-semibold tabular-nums"
                    style={{ color: (s.netPnl ?? 0) >= 0 ? "var(--profit)" : "var(--loss)" }}
                  >
                    {formatSignedCurrency(s.netPnl ?? 0)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <RowActions session={s} onUpload={onUpload} onAddTrade={onAddTrade} onEdit={onEdit} onDelete={onDelete} />
                </div>
              </div>
            ))}
          </div>

          {/* Table — md and up */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">Session</th>
                  <th className="px-4 py-2.5 font-medium">Asset</th>
                  <th className="px-4 py-2.5 text-right font-medium">Trades</th>
                  <th className="px-4 py-2.5 text-right font-medium">Win rate</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net P&L</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const positive = (s.netPnl ?? 0) >= 0;
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0 transition-colors hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <p className="font-medium">{s.name}</p>
                        {s.strategy && <p className="text-xs text-muted">{s.strategy}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="accent">{s.pair}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">
                        {s.tradeCount ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">
                        {formatPercent(s.winRate ?? 0, 0)}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums",
                          positive ? "text-profit" : "text-loss",
                        )}
                      >
                        {formatSignedCurrency(s.netPnl ?? 0)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                        {formatCurrency(s.balance ?? s.startingBalance)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(s.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <RowActions session={s} onUpload={onUpload} onAddTrade={onAddTrade} onEdit={onEdit} onDelete={onDelete} />
                        </div>
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

function RowActions({
  session,
  onUpload,
  onAddTrade,
  onEdit,
  onDelete,
}: {
  session: Session;
  onUpload: (session: Session) => void;
  onAddTrade: (session: Session) => void;
  onEdit: (session: Session) => void;
  onDelete: (session: Session) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onUpload(session)}
        title="Upload CSV"
        className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Upload className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onAddTrade(session)}
        title="Add trade"
        className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onEdit(session)}
        title="Edit session"
        className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(session)}
        title="Delete session"
        className="rounded-md p-1.5 text-muted transition-colors hover:bg-loss-soft hover:text-loss"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
