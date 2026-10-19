"use client";

import { useCallback, useEffect, useState } from "react";
import { listDatasets, listSessions, listStrategies } from "./storage/repo";
import type { DatasetMeta, ReplaySession, StrategyTemplate } from "./types";

// Data hooks over Replay's server API. Any write anywhere calls
// `notifyReplayChanged()` so every mounted list refreshes.

const EVENT = "replay-db-changed";

export function notifyReplayChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

function useApiList<T>(load: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await load();
      setItems(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    // Initial fetch from the API, then refresh on change events.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const on = () => void refresh();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [refresh]);

  return { items, loading, error, refresh };
}

export function useDatasets() {
  const { items, ...rest } = useApiList<DatasetMeta>(listDatasets);
  return { datasets: items, ...rest };
}

const listSummary = () => listSessions("summary");
const listAnalytics = () => listSessions("analytics");

/** "summary" omits ledgers; "analytics" includes ledgers and journals (no screenshots). */
export function useSessions(view: "summary" | "analytics" = "summary") {
  const { items, ...rest } = useApiList<ReplaySession>(view === "analytics" ? listAnalytics : listSummary);
  return { sessions: items, ...rest };
}

export function useStrategies() {
  const { items, ...rest } = useApiList<StrategyTemplate>(listStrategies);
  return { strategies: items, ...rest };
}
