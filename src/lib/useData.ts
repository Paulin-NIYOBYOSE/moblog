"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastContext";
import type { Account, AccountInput, Trade, TradeInput, Content, ContentInput } from "./types";

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
  const [content, setContent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // ToastProvider builds a fresh `toast` object on every render, so depending
  // on it directly would rebuild `refresh` each time a toast fires — and a
  // failed fetch showing an error toast would then retrigger that same fetch
  // in a loop. Read it through a ref instead.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

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

  const refreshContent = useCallback(async () => {
    const res = await fetch("/api/content", { cache: "no-store" });
    if (!res.ok) throw new Error(await parseError(res));
    setContent(await res.json());
  }, []);

  const refresh = useCallback(async (accountId?: string | null) => {
    try {
      setError(null);
      await refreshAccounts();
      await refreshTrades(accountId);
      await refreshContent();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load data";
      setError(msg);
      toastRef.current.error(msg);
    } finally {
      setLoading(false);
    }
  }, [refreshAccounts, refreshTrades, refreshContent]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createAccount = useCallback(async (input: AccountInput) => {
    const toastId = toastRef.current.loading("Creating account...");
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await parseError(res));
      await refreshAccounts();
      toastRef.current.success("Account created");
    } catch (e) {
      toastRef.current.error(e instanceof Error ? e.message : "Failed to create account");
      throw e;
    } finally {
      toastRef.current.remove(toastId);
    }
  }, [refreshAccounts]);

  const updateAccount = useCallback(
    async (id: string, input: AccountInput) => {
      const toastId = toastRef.current.loading("Updating account...");
      try {
        const res = await fetch(`/api/accounts/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshAccounts();
        toastRef.current.success("Account updated");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to update account");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [refreshAccounts],
  );

  const deleteAccount = useCallback(
    async (id: string) => {
      const toastId = toastRef.current.loading("Deleting account...");
      try {
        const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshAccounts();
        toastRef.current.success("Account deleted");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to delete account");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [refreshAccounts],
  );

  const createTrade = useCallback(
    async (input: TradeInput) => {
      const toastId = toastRef.current.loading("Saving trade...");
      try {
        const res = await fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshTrades(input.accountId);
        toastRef.current.success("Trade saved");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to save trade");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [refreshTrades],
  );

  const updateTrade = useCallback(
    async (id: string, input: TradeInput) => {
      const toastId = toastRef.current.loading("Updating trade...");
      try {
        const res = await fetch(`/api/trades/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshTrades(input.accountId);
        toastRef.current.success("Trade updated");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to update trade");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [refreshTrades],
  );

  const deleteTrade = useCallback(
    async (id: string, accountId: string) => {
      const toastId = toastRef.current.loading("Deleting trade...");
      try {
        const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshTrades(accountId);
        toastRef.current.success("Trade deleted");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to delete trade");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [refreshTrades],
  );

  const createContent = useCallback(
    async (input: ContentInput) => {
      const toastId = toastRef.current.loading("Creating content...");
      try {
        const res = await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshContent();
        toastRef.current.success("Content created");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to create content");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [refreshContent],
  );

  const updateContent = useCallback(
    async (id: string, input: ContentInput) => {
      const toastId = toastRef.current.loading("Updating content...");
      try {
        const res = await fetch(`/api/content/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshContent();
        toastRef.current.success("Content updated");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to update content");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [refreshContent],
  );

  const deleteContent = useCallback(
    async (id: string) => {
      const toastId = toastRef.current.loading("Deleting content...");
      try {
        const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await refreshContent();
        toastRef.current.success("Content deleted");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to delete content");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [refreshContent],
  );

  return {
    accounts,
    trades,
    content,
    loading,
    error,
    refresh,
    refreshTrades,
    refreshContent,
    createAccount,
    updateAccount,
    deleteAccount,
    createTrade,
    updateTrade,
    deleteTrade,
    createContent,
    updateContent,
    deleteContent,
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
