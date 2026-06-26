"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LineChart, Plus } from "lucide-react";
import { useData, logout } from "@/lib/useData";
import { computeStats } from "@/lib/utils";
import type { Account, Trade, TradeInput } from "@/lib/types";
import Sidebar from "./Sidebar";
import StatCards from "./StatCards";
import Calendar from "./Calendar";
import EquityCurve from "./EquityCurve";
import Analytics from "./Analytics";
import JournalTable from "./JournalTable";
import TradeModal from "./TradeModal";
import DayPanel from "./DayPanel";
import OpenPositions from "./OpenPositions";
import AccountModal from "./AccountModal";
import ThemeToggle from "./ThemeToggle";

export default function Dashboard() {
  const router = useRouter();
  const {
    accounts,
    trades,
    loading,
    error,
    refresh,
    refreshTrades,
    createAccount,
    createTrade,
    updateTrade,
    deleteTrade,
  } = useData();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Auto-select first account once loaded.
  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Re-fetch trades when account changes.
  useEffect(() => {
    if (selectedAccountId) {
      refreshTrades(selectedAccountId);
    }
  }, [selectedAccountId, refreshTrades]);

  const selectedAccount =
    accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;
  const filteredTrades = useMemo(
    () =>
      selectedAccountId
        ? trades.filter((t) => t.accountId === selectedAccountId)
        : trades,
    [trades, selectedAccountId],
  );
  const stats = useMemo(
    () => computeStats(filteredTrades, selectedAccount?.startingBalance ?? 0),
    [filteredTrades, selectedAccount],
  );

  function openAdd(date?: string | null) {
    setEditingTrade(null);
    setDefaultDate(date ?? null);
    setModalOpen(true);
  }

  function openEdit(trade: Trade) {
    setEditingTrade(trade);
    setDefaultDate(null);
    setDayPanelOpen(false);
    setModalOpen(true);
  }

  function selectDay(day: string) {
    setSelectedDay(day);
    setDayPanelOpen(true);
  }

  async function handleSubmit(input: TradeInput) {
    if (editingTrade) {
      await updateTrade(editingTrade.id, input);
    } else {
      await createTrade(input);
    }
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background" id="top">
      <Sidebar
        accounts={accounts}
        selectedAccount={selectedAccount}
        onSelectAccount={(a: Account) => setSelectedAccountId(a.id)}
        onAddTrade={() => openAdd()}
        onAddAccount={() => setAccountModalOpen(true)}
        onLogout={handleLogout}
      />

      <div className="lg:pl-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <LineChart className="h-4.5 w-4.5" strokeWidth={2.5} />
            </div>
            <span className="text-base font-semibold">Moblog</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => openAdd()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 hidden items-center justify-between lg:flex">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Dashboard
              </h1>
              <p className="mt-0.5 text-sm text-muted">
                {selectedAccount ? selectedAccount.name : "Loading accounts..."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAdd()}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-transform hover:opacity-95 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Add Trade
            </button>
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

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                <div className="xl:col-span-8">
                  <Calendar trades={filteredTrades} onSelectDay={selectDay} />
                </div>
                <div className="space-y-5 xl:col-span-4">
                  <EquityCurve
                    trades={filteredTrades}
                    startingBalance={selectedAccount?.startingBalance ?? 0}
                  />
                  <Analytics stats={stats} trades={filteredTrades} />
                </div>
              </div>

              <OpenPositions trades={filteredTrades} onEdit={openEdit} />

              <JournalTable
                trades={filteredTrades}
                startingBalance={selectedAccount?.startingBalance ?? 0}
                onEdit={openEdit}
                onAdd={() => openAdd()}
              />
            </div>
          )}
        </main>
      </div>

      <TradeModal
        open={modalOpen}
        accounts={accounts}
        trade={editingTrade}
        defaultDate={defaultDate}
        defaultAccountId={selectedAccount?.id}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        onDelete={(id) => deleteTrade(id, selectedAccount?.id || "")}
      />

      <AccountModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        onSubmit={createAccount}
      />

      <DayPanel
        open={dayPanelOpen}
        day={selectedDay}
        trades={filteredTrades}
        onClose={() => setDayPanelOpen(false)}
        onAddForDay={(day) => openAdd(day)}
        onEditTrade={openEdit}
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-border bg-card"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="h-[460px] animate-pulse rounded-2xl border border-border bg-card xl:col-span-8" />
        <div className="space-y-5 xl:col-span-4">
          <div className="h-[200px] animate-pulse rounded-2xl border border-border bg-card" />
          <div className="h-[240px] animate-pulse rounded-2xl border border-border bg-card" />
        </div>
      </div>
    </div>
  );
}
