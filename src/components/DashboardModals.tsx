"use client";

import { useEffect, useState } from "react";
import TradeModal from "./TradeModal";
import { useData } from "@/lib/useData";
import { useSelectedAccount } from "./AccountContext";
import type { Trade, TradeInput } from "@/lib/types";

export default function DashboardModals() {
  const { accounts, createTrade, updateTrade, deleteTrade } = useData();
  const { selectedAccount } = useSelectedAccount(accounts);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | null>(null);

  useEffect(() => {
    function handleOpen(e: CustomEvent) {
      const detail = e.detail as { trade?: Trade; date?: string } | undefined;
      if (detail?.trade) {
        setEditingTrade(detail.trade);
        setDefaultDate(null);
      } else {
        setEditingTrade(null);
        setDefaultDate(detail?.date ?? null);
      }
      setModalOpen(true);
    }
    window.addEventListener("dashboard-open-modal", handleOpen as EventListener);
    return () => window.removeEventListener("dashboard-open-modal", handleOpen as EventListener);
  }, []);

  async function handleSubmit(input: TradeInput) {
    if (editingTrade) {
      await updateTrade(editingTrade.id, input);
    } else {
      await createTrade(input);
    }
  }

  async function handleDelete(id: string) {
    await deleteTrade(id, selectedAccount?.id || "");
  }

  return (
    <TradeModal
      open={modalOpen}
      accounts={accounts}
      trade={editingTrade}
      defaultDate={defaultDate}
      defaultAccountId={selectedAccount?.id}
      onClose={() => setModalOpen(false)}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
    />
  );
}
