"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTestingData } from "@/lib/useTestingData";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import SectionTabs from "@/components/testing/SectionTabs";
import SessionsTable from "@/components/testing/SessionsTable";
import SessionModal from "@/components/testing/SessionModal";
import SessionImportPanel from "@/components/testing/SessionImportPanel";
import BacktestTradeModal from "@/components/testing/BacktestTradeModal";
import type { Session } from "@/lib/testing/types";

export default function TestingSessionsPage() {
  const {
    sessions,
    loading,
    error,
    createSession,
    updateSession,
    deleteSession,
    createBacktestTrade,
    importBacktestTrades,
  } = useTestingData();

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importSession, setImportSession] = useState<Session | null>(null);

  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeSession, setTradeSession] = useState<Session | null>(null);

  function openCreate() {
    setEditingSession(null);
    setSessionModalOpen(true);
  }

  function openEdit(session: Session) {
    setEditingSession(session);
    setSessionModalOpen(true);
  }

  async function handleDelete(session: Session) {
    await deleteSession(session.id);
  }

  return (
    <div>
      <PageHeader title="Testing" subtitle="Backtesting sessions & analytics" />
      <SectionTabs />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-64" />
      ) : (
        <SessionsTable
          sessions={sessions}
          onCreate={openCreate}
          onEdit={openEdit}
          onDelete={handleDelete}
          onUpload={(s) => {
            setImportSession(s);
            setImportOpen(true);
          }}
          onAddTrade={(s) => {
            setTradeSession(s);
            setTradeModalOpen(true);
          }}
        />
      )}

      <SessionModal
        open={sessionModalOpen}
        session={editingSession}
        onClose={() => setSessionModalOpen(false)}
        onSubmit={async (input) => {
          if (editingSession) {
            await updateSession(editingSession.id, input);
          } else {
            const created = await createSession(input);
            if (created) {
              setImportSession(created);
              setImportOpen(true);
            }
          }
        }}
        onDelete={deleteSession}
      />

      <SessionImportPanel
        open={importOpen}
        session={importSession}
        onClose={() => setImportOpen(false)}
        onImport={importBacktestTrades}
      />

      <BacktestTradeModal
        open={tradeModalOpen}
        sessions={sessions}
        defaultSessionId={tradeSession?.id}
        onClose={() => setTradeModalOpen(false)}
        onSubmit={createBacktestTrade}
      />
    </div>
  );
}
