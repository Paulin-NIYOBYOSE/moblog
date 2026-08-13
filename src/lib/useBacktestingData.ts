"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastContext";
import type { BacktestItem } from "./types";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function useBacktestingData() {
  const [items, setItems] = useState<BacktestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/backtesting/items", { cache: "no-store" });
      if (!res.ok) throw new Error(await parseError(res));
      setItems(await res.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load backtesting progress";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setCompleted = useCallback(
    async (id: string, completed: boolean) => {
      // Optimistic update so checkbox toggles feel instant.
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, completed, completedAt: completed ? new Date().toISOString() : null } : i)),
      );
      try {
        const res = await fetch(`/api/backtesting/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed }),
        });
        if (!res.ok) throw new Error(await parseError(res));
        const updated = await res.json();
        setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update item");
        await refresh();
      }
    },
    [refresh, toast],
  );

  const completeMany = useCallback(
    async (ids: string[]) => {
      const toastId = toast.loading("Updating progress...");
      try {
        await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(`/api/backtesting/items/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ completed: true }),
            });
            if (!res.ok) throw new Error(await parseError(res));
          }),
        );
        await refresh();
        toast.success("Marked as completed");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update progress");
      } finally {
        toast.remove(toastId);
      }
    },
    [refresh, toast],
  );

  return { items, loading, error, refresh, setCompleted, completeMany };
}
