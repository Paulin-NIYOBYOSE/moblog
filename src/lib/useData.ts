"use client";

import { useCallback, useEffect, useState } from "react";
import type { Account, AccountInput, Trade, TradeInput } from "./types";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function useData() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    const res = await fetch("/api/accounts", { cache: "no-store" });
    if (!res.ok) throw new Error(await parseError(res));
    setAccounts(await res.json());
  }, []);

  const refreshTrades = useCallback(async (accountId?: string | null) => {
    const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
    const res = await fetch(`/api/trades${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error(await parseError(res));
    setTrades(await res.json());
  }, []);

  const refresh = useCallback(async (accountId?: string | null) => {
    try {
      setError(null);
      await refreshAccounts();
      await refreshTrades(accountId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [refreshAccounts, refreshTrades]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createAccount = useCallback(async (input: AccountInput) => {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await parseError(res));
    await refreshAccounts();
  }, [refreshAccounts]);

  const createTrade = useCallback(
    async (input: TradeInput) => {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await parseError(res));
      await refreshTrades(input.accountId);
    },
    [refreshTrades],
  );

  const updateTrade = useCallback(
    async (id: string, input: TradeInput) => {
      const res = await fetch(`/api/trades/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await parseError(res));
      await refreshTrades(input.accountId);
    },
    [refreshTrades],
  );

  const deleteTrade = useCallback(
    async (id: string, accountId: string) => {
      const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res));
      await refreshTrades(accountId);
    },
    [refreshTrades],
  );

  return {
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
  };
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
