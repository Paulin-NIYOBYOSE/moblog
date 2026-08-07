"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Search, SlidersHorizontal, X } from "lucide-react";
import { useData } from "@/lib/useData";
import { useSelectedAccount } from "@/components/AccountContext";
import { useModal } from "@/components/ModalContext";
import JournalTable from "@/components/JournalTable";
import CustomSelect from "@/components/CustomSelect";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import FilterBar from "@/components/ui/FilterBar";
import Skeleton from "@/components/ui/Skeleton";
import { cn, isClosed } from "@/lib/utils";
import type { Trade } from "@/lib/types";

type Direction = "ALL" | "LONG" | "SHORT";
type Status = "ALL" | "OPEN" | "CLOSED";

export default function JournalPage() {
  const { accounts, trades, loading, error } = useData();
  const { selectedAccount, setSelectedAccountId } =
    useSelectedAccount(accounts);
  const { openEdit, openAdd } = useModal();

  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<Direction>("ALL");
  const [status, setStatus] = useState<Status>("ALL");
  const [setup, setSetup] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const setups = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) if (t.setup) set.add(t.setup);
    return Array.from(set).sort();
  }, [trades]);

  const filteredTrades = useMemo(() => {
    let list: Trade[] = selectedAccount
      ? trades.filter((t) => t.accountId === selectedAccount.id)
      : trades;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.pair.toLowerCase().includes(q) ||
          (t.setup?.toLowerCase() || "").includes(q) ||
          (t.comment?.toLowerCase() || "").includes(q) ||
          (t.exitLogic?.toLowerCase() || "").includes(q),
      );
    }
    if (direction !== "ALL")
      list = list.filter((t) => t.direction === direction);
    if (status === "OPEN") list = list.filter((t) => !isClosed(t));
    if (status === "CLOSED") list = list.filter((t) => isClosed(t));
    if (setup) list = list.filter((t) => t.setup === setup);
    if (dateFrom) list = list.filter((t) => t.openDate >= dateFrom);
    if (dateTo) list = list.filter((t) => t.openDate <= dateTo);

    return list.sort((a, b) => b.openDate.localeCompare(a.openDate));
  }, [
    trades,
    selectedAccount,
    search,
    direction,
    status,
    setup,
    dateFrom,
    dateTo,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / PAGE_SIZE));
  const pagedTrades = filteredTrades.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  return (
    <div>
      <PageHeader
        title="Trades"
        subtitle={selectedAccount ? selectedAccount.name : "Loading accounts..."}
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <FilterBar
        expanded={showFilters}
        expandedContent={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CustomSelect
              value={direction}
              onChange={(v) => {
                setDirection(v as Direction);
                setPage(1);
              }}
              options={[
                { value: "ALL", label: "All directions" },
                { value: "LONG", label: "Long only" },
                { value: "SHORT", label: "Short only" },
              ]}
            />
            <CustomSelect
              value={status}
              onChange={(v) => {
                setStatus(v as Status);
                setPage(1);
              }}
              options={[
                { value: "ALL", label: "All statuses" },
                { value: "OPEN", label: "Open" },
                { value: "CLOSED", label: "Closed" },
              ]}
            />
            <CustomSelect
              value={setup}
              onChange={(v) => {
                setSetup(v);
                setPage(1);
              }}
              options={[
                { value: "", label: "All setups" },
                ...setups.map((s) => ({ value: s, label: s })),
              ]}
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="input"
                placeholder="From"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="input"
                placeholder="To"
              />
            </div>
          </div>
        }
      >
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search pair, setup, comment, exit logic..."
            className="input pl-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <CustomSelect
          value={selectedAccount?.id || ""}
          onChange={(v) => {
            setSelectedAccountId(v || null);
            setPage(1);
          }}
          options={[
            { value: "", label: "All accounts" },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
          className="w-40"
        />

        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors",
            showFilters
              ? "bg-surface-2 text-foreground"
              : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
      </FilterBar>

      {loading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <JournalTable
            trades={pagedTrades}
            startingBalance={selectedAccount?.startingBalance ?? 0}
            onEdit={openEdit}
            onAdd={() => openAdd()}
          />

          {filteredTrades.length > PAGE_SIZE && (
            <Card padding="sm" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted">
                Showing {pagedTrades.length} of {filteredTrades.length} trades
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-border px-3 py-1.5 font-medium transition-colors disabled:opacity-40 hover:bg-surface-2"
                >
                  Previous
                </button>
                <span className="tabular-nums">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 font-medium transition-colors disabled:opacity-40 hover:bg-surface-2"
                >
                  Next
                </button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
