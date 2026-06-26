"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastContext";
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
  const toast = useToast();

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
      const msg = e instanceof Error ? e.message : "Failed to load data";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [refreshAccounts, refreshTrades, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createAccount = useCallback(async (input: AccountInput) => {
    const toastId = toast.loading("Creating account...");
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await parseError(res));
      await refreshAccounts();
      toast.success("Account created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create account");
      throw e;
    } finally {
      toast.remove(toastId);
    }
  }, [refreshAccounts, toast]);

  const updateAccount = useCallback(
    async (id: string, input: AccountInput) => {
      const toastId = toast.loading("Updating account...");
      try {
        const res = await fetch(`/api/accounts/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshAccounts();
        toast.success("Account updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update account");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshAccounts, toast],
  );

  const deleteAccount = useCallback(
    async (id: string) => {
      const toastId = toast.loading("Deleting account...");
      try {
        const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshAccounts();
        toast.success("Account deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete account");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshAccounts, toast],
  );

  const createTrade = useCallback(
    async (input: TradeInput) => {
      const toastId = toast.loading("Saving trade...");
      try {
        const res = await fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshTrades(input.accountId);
        toast.success("Trade saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save trade");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshTrades, toast],
  );

  const updateTrade = useCallback(
    async (id: string, input: TradeInput) => {
      const toastId = toast.loading("Updating trade...");
      try {
        const res = await fetch(`/api/trades/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshTrades(input.accountId);
        toast.success("Trade updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update trade");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshTrades, toast],
  );

  const deleteTrade = useCallback(
    async (id: string, accountId: string) => {
      const toastId = toast.loading("Deleting trade...");
      try {
        const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshTrades(accountId);
        toast.success("Trade deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete trade");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refreshTrades, toast],
  );

  return {
    accounts,
    trades,
    loading,
    error,
    refresh,
    refreshTrades,
    createAccount,
    updateAccount,
    deleteAccount,
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
