"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Plus, TrendingUp } from "lucide-react";
import { useData } from "@/lib/useData";
import { useSelectedAccount } from "@/components/AccountContext";
import { useModal } from "@/components/ModalContext";
import StatCards from "@/components/StatCards";
import EquityCurve from "@/components/EquityCurve";
import OpenPositions from "@/components/OpenPositions";
import JournalTable from "@/components/JournalTable";
import {
  computeStats,
  formatCurrency,
  formatSignedCurrency,
} from "@/lib/utils";

export default function DashboardPage() {
  const { accounts, trades, loading, error } = useData();
  const { selectedAccount } = useSelectedAccount(accounts);
  const { openEdit, openAdd } = useModal();

  const filteredTrades = useMemo(
    () =>
      selectedAccount
        ? trades.filter((t) => t.accountId === selectedAccount.id)
        : trades,
    [trades, selectedAccount],
  );
  const stats = useMemo(
    () => computeStats(filteredTrades, selectedAccount?.startingBalance ?? 0),
    [filteredTrades, selectedAccount],
  );

  const recentTrades = filteredTrades.slice(0, 5);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted">
            {selectedAccount ? selectedAccount.name : "Loading accounts..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openAdd()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
          >
            <Plus className="h-4 w-4" /> Add trade
          </button>
          <Link
            href="/journal"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            View all trades <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-5">
          <StatCards stats={stats} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <EquityCurve
                trades={filteredTrades}
                startingBalance={selectedAccount?.startingBalance ?? 0}
              />
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold">Quick summary</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted">Starting balance</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(selectedAccount?.startingBalance ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted">Current balance</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(stats.currentBalance)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted">Net P&L</span>
                  <span
                    className={
                      "font-medium tabular-nums " +
                      (stats.netPnl >= 0 ? "text-profit" : "text-loss")
                    }
                  >
                    {formatSignedCurrency(stats.netPnl)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted">Return %</span>
                  <span
                    className={
                      "font-medium tabular-nums " +
                      (stats.returnPct >= 0 ? "text-profit" : "text-loss")
                    }
                  >
                    {stats.returnPct.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Open positions</span>
                  <span className="font-medium tabular-nums">
                    {stats.openTrades}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Link
                  href="/journal"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-surface-2"
                >
                  Trades
                </Link>
                <Link
                  href="/analytics"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-surface-2"
                >
                  Analytics
                </Link>
              </div>
            </div>
          </div>

          <OpenPositions trades={filteredTrades} onEdit={openEdit} />

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Recent trades</h3>
              <Link
                href="/journal"
                className="text-sm text-muted hover:text-foreground"
              >
                View all
              </Link>
            </div>
            {recentTrades.length === 0 ? (
              <p className="text-sm text-muted">No trades yet.</p>
            ) : (
              <JournalTable
                trades={recentTrades}
                startingBalance={selectedAccount?.startingBalance ?? 0}
                onEdit={openEdit}
                onAdd={() => openAdd()}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-border bg-card"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="h-[220px] animate-pulse rounded-2xl border border-border bg-card lg:col-span-2" />
        <div className="h-[220px] animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    </div>
  );
}
