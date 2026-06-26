"use client";

import { useEffect } from "react";
import { ArrowDownRight, ArrowUpRight, Plus, X } from "lucide-react";
import type { Trade } from "@/lib/types";
import { dateKey, formatCurrency, formatSignedCurrency, isClosed } from "@/lib/utils";

export default function DayPanel({
  open,
  day,
  trades,
  onClose,
  onAddForDay,
  onEditTrade,
}: {
  open: boolean;
  day: string | null;
  trades: Trade[];
  onClose: () => void;
  onAddForDay: (day: string) => void;
  onEditTrade: (trade: Trade) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !day) return null;

  const dayTrades = trades.filter((t) =>
    dateKey(new Date(t.closeDate || t.openDate)) === day,
  );
  const closed = dayTrades.filter(isClosed);
  const total = closed.reduce((sum, t) => sum + t.pnl, 0);
  const wins = closed.filter((t) => t.pnl > 0).length;

  const label = new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl animate-fade-in">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{label}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {dayTrades.length} trade{dayTrades.length === 1 ? "" : "s"}
              {closed.length > 0 && ` · ${wins}W ${closed.length - wins}L`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {closed.length > 0 && (
          <div className="border-b border-border px-5 py-3">
            <span className="text-xs text-muted">Day P&L</span>
            <div className="text-2xl font-semibold tabular-nums" style={{ color: total >= 0 ? "var(--profit)" : "var(--loss)" }}>
              {formatSignedCurrency(total)}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {dayTrades.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No trades on this day.</p>
          ) : (
            <div className="space-y-2">
              {dayTrades.map((t) => {
                const positive = t.pnl >= 0;
                const closed = isClosed(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onEditTrade(t)}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-left transition-colors hover:border-accent/40"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: t.direction === "LONG" ? "var(--profit-soft)" : "var(--loss-soft)",
                          color: t.direction === "LONG" ? "var(--profit)" : "var(--loss)",
                        }}
                      >
                        {t.direction === "LONG" ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4" />
                        )}
                      </span>
                      <div>
                        <div className="font-medium">{t.pair}</div>
                        <div className="text-xs text-muted">
                          {t.setup || t.direction} {closed && t.exitLogic ? `· ${t.exitLogic}` : "· open"}
                        </div>
                      </div>
                    </div>
                    <span
                      className="font-semibold tabular-nums"
                      style={{ color: positive ? "var(--profit)" : "var(--loss)" }}
                    >
                      {closed ? formatSignedCurrency(t.pnl) : "open"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <button
            type="button"
            onClick={() => onAddForDay(day)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-transform hover:opacity-95 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> Add trade for this day
          </button>
        </div>
      </div>
    </div>
  );
}
