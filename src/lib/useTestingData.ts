"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastContext";
import type {
  BacktestTrade,
  BacktestTradeInput,
  Session,
  SessionInput,
} from "./testing/types";
import type { CsvParseError } from "./testing/csv";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export interface ImportSummary {
  created: number;
  skipped: number;
  errors: CsvParseError[];
}

export function useTestingData() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const refreshSessions = useCallback(async () => {
    const res = await fetch("/api/sessions", { cache: "no-store" });
    if (!res.ok) throw new Error(await parseError(res));
    setSessions(await res.json());
  }, []);

  const refreshTrades = useCallback(async (sessionId?: string | null) => {
    const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const res = await fetch(`/api/backtest-trades${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error(await parseError(res));
    setTrades(await res.json());
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      await Promise.all([refreshSessions(), refreshTrades()]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load testing data";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [refreshSessions, refreshTrades, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createSession = useCallback(
    async (input: SessionInput) => {
      const toastId = toast.loading("Creating session...");
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        const session = (await res.json()) as Session;
        await refreshSessions();
        toast.success("Session created");
        return session;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create session");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshSessions, toast],
  );

  const updateSession = useCallback(
    async (id: string, input: SessionInput) => {
      const toastId = toast.loading("Updating session...");
      try {
        const res = await fetch(`/api/sessions/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshSessions();
        toast.success("Session updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update session");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshSessions, toast],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      const toastId = toast.loading("Deleting session...");
      try {
        const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await Promise.all([refreshSessions(), refreshTrades()]);
        toast.success("Session deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete session");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshSessions, refreshTrades, toast],
  );

  const createBacktestTrade = useCallback(
    async (input: BacktestTradeInput) => {
      const toastId = toast.loading("Saving trade...");
      try {
        const res = await fetch("/api/backtest-trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await Promise.all([refreshTrades(), refreshSessions()]);
        toast.success("Trade saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save trade");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshTrades, refreshSessions, toast],
  );

  const updateBacktestTrade = useCallback(
    async (id: string, input: BacktestTradeInput) => {
      const toastId = toast.loading("Updating trade...");
      try {
        const res = await fetch(`/api/backtest-trades/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await Promise.all([refreshTrades(), refreshSessions()]);
        toast.success("Trade updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update trade");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshTrades, refreshSessions, toast],
  );

  const deleteBacktestTrade = useCallback(
    async (id: string) => {
      const toastId = toast.loading("Deleting trade...");
      try {
        const res = await fetch(`/api/backtest-trades/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await Promise.all([refreshTrades(), refreshSessions()]);
        toast.success("Trade deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete trade");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshTrades, refreshSessions, toast],
  );

  const importBacktestTrades = useCallback(
    async (
      sessionId: string,
      rows: Omit<BacktestTradeInput, "sessionId">[],
    ): Promise<ImportSummary> => {
      const toastId = toast.loading(`Importing ${rows.length} trades...`);
      try {
        const res = await fetch("/api/backtest-trades/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, trades: rows }),
        });
        const data = await res.json();
        if (!res.ok && !Array.isArray(data?.errors)) {
          throw new Error(data?.error ?? `Request failed (${res.status})`);
        }
        await Promise.all([refreshTrades(), refreshSessions()]);
        if (data.created > 0) {
          toast.success(`Imported ${data.created} trade${data.created === 1 ? "" : "s"}`);
        }
        if (data.errors?.length) {
          toast.error(`${data.errors.length} row(s) failed to import`);
        }
        return data as ImportSummary;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to import trades");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshTrades, refreshSessions, toast],
  );

  return {
    sessions,
    trades,
    loading,
    error,
    refresh,
    refreshTrades,
    createSession,
    updateSession,
    deleteSession,
    createBacktestTrade,
    updateBacktestTrade,
    deleteBacktestTrade,
    importBacktestTrades,
  };
}
