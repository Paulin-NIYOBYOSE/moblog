import { useCallback, useEffect, useState } from "react";
import type { BacktestScheduleConfig, BacktestSession } from "./backtestSchedule";
import { getDefaultSchedule } from "./backtestSchedule";

interface UseBacktestScheduleResult {
  config: BacktestScheduleConfig | null;
  loading: boolean;
  error: string | null;
  updateConfig: (config: BacktestScheduleConfig) => Promise<void>;
  updateWeekdaySessions: (sessions: BacktestSession[]) => Promise<void>;
  updateWeekendSessions: (sessions: BacktestSession[]) => Promise<void>;
  updatePairsPerDay: (pairsPerDay: number) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useBacktestSchedule(): UseBacktestScheduleResult {
  const [config, setConfig] = useState<BacktestScheduleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/notebook/backtest-schedule");
      
      if (!response.ok) {
        throw new Error("Failed to fetch schedule");
      }

      const data = await response.json();
      setConfig(data);
    } catch (err) {
      console.error("Error fetching backtest schedule:", err);
      setError(err instanceof Error ? err.message : "Failed to load schedule");
      // Fallback to default schedule on error
      setConfig(getDefaultSchedule());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSchedule();
  }, [fetchSchedule]);

  const updateConfig = useCallback(async (newConfig: BacktestScheduleConfig) => {
    try {
      setError(null);
      
      // Optimistic update
      const previousConfig = config;
      setConfig(newConfig);

      const response = await fetch("/api/notebook/backtest-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update schedule");
      }

      const savedConfig = await response.json();
      setConfig(savedConfig);
    } catch (err) {
      console.error("Error updating backtest schedule:", err);
      setError(err instanceof Error ? err.message : "Failed to save schedule");
      // Revert optimistic update on error
      await fetchSchedule();
      throw err;
    }
  }, [config, fetchSchedule]);

  const updateWeekdaySessions = useCallback(
    async (sessions: BacktestSession[]) => {
      if (!config) return;
      await updateConfig({
        ...config,
        weekday: { sessions },
      });
    },
    [config, updateConfig],
  );

  const updateWeekendSessions = useCallback(
    async (sessions: BacktestSession[]) => {
      if (!config) return;
      await updateConfig({
        ...config,
        weekend: { sessions },
      });
    },
    [config, updateConfig],
  );

  const updatePairsPerDay = useCallback(
    async (pairsPerDay: number) => {
      if (!config) return;
      await updateConfig({
        ...config,
        pairsPerDay,
      });
    },
    [config, updateConfig],
  );

  return {
    config,
    loading,
    error,
    updateConfig,
    updateWeekdaySessions,
    updateWeekendSessions,
    updatePairsPerDay,
    refresh: fetchSchedule,
  };
}
