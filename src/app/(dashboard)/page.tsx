"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, History, LayoutDashboard, Plus, Wallet } from "lucide-react";
import { useData } from "@/lib/useData";
import { useSelectedAccount } from "@/components/AccountContext";
import { useModal } from "@/components/ModalContext";
import StatCards from "@/components/StatCards";
import EquityCurve from "@/components/EquityCurve";
import MonthlyChart from "@/components/MonthlyChart";
import OpenPositions from "@/components/OpenPositions";
import JournalTable from "@/components/JournalTable";
import Card, { CardHeader } from "@/components/ui/Card";
import TodayStrip from "@/components/TodayStrip";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
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
  const startingBalance = selectedAccount?.startingBalance ?? 0;
  const stats = useMemo(
    () => computeStats(filteredTrades, startingBalance),
    [filteredTrades, startingBalance],
  );

  const recentTrades = filteredTrades.slice(0, 5);

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <LayoutDashboard className="h-3 w-3" /> {greeting()} ·{" "}
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </>
        }
        title="Dashboard"
        subtitle={selectedAccount ? selectedAccount.name : "Loading accounts..."}
        actions={
          <>
            <Link href="/journal" className="btn btn-secondary">
              View all trades <ArrowRight className="h-4 w-4" />
            </Link>
            <button type="button" onClick={() => openAdd()} className="btn btn-primary">
              <Plus className="h-4 w-4" /> Add trade
            </button>
          </>
        }
      />

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
          <TodayStrip />

          <StatCards stats={stats} trades={filteredTrades} startingBalance={startingBalance} />

          <div className="grid grid-cols-1 gap-5">
            <EquityCurve trades={filteredTrades} startingBalance={startingBalance} />
            <MonthlyChart trades={filteredTrades} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card padding="lg" className="lg:col-span-1">
              <CardHeader icon={Wallet} title="Quick summary" subtitle="Account at a glance" />
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted">Starting balance</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(startingBalance)}
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
                  className="btn btn-secondary flex-1"
                >
                  Trades
                </Link>
                <Link
                  href="/analytics"
                  className="btn btn-secondary flex-1"
                >
                  Analytics
                </Link>
              </div>
            </Card>
            <div className="lg:col-span-2">
              <OpenPositions trades={filteredTrades} onEdit={openEdit} />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4 text-muted" /> Recent trades
              </h3>
              <Link href="/journal" className="btn btn-ghost btn-sm">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {recentTrades.length === 0 ? (
              <p className="text-sm text-muted">No trades yet.</p>
            ) : (
              <JournalTable
                trades={recentTrades}
                startingBalance={startingBalance}
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

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5">
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[320px]" />
      </div>
    </div>
  );
}
