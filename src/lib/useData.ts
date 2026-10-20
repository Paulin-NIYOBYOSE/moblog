"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
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

// One shared store for accounts, trades and content. The layout, sidebar,
// modals and page all call useData(); they now share a single copy instead of
// each fetching everything (which queued ~12 requests per page load). Each
// resource is fetched once (in-flight requests are reused), the three load in
// parallel, and navigating between pages shows the cached data at once while
// it refreshes quietly in the background.

interface DataState {
  accounts: Account[];
  trades: Trade[];
  content: Content[];
  loading: boolean;
  error: string | null;
}

type Resource = "accounts" | "trades" | "content";
const URLS: Record<Resource, string> = { accounts: "/api/accounts", trades: "/api/trades", content: "/api/content" };
/** Data younger than this is shown without refetching when a page mounts. */
const FRESH_MS = 30_000;

const initialState: DataState = { accounts: [], trades: [], content: [], loading: true, error: null };
let state: DataState = initialState;
const listeners = new Set<() => void>();
const inflight = new Map<Resource, Promise<void>>();
let inflightAll: Promise<void> | null = null;
let loadedAt = 0;

function setState(patch: Partial<DataState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getState = () => state;
const getServerState = () => initialState;

function load(r: Resource): Promise<void> {
  const running = inflight.get(r);
  if (running) return running;
  const p = fetch(URLS[r], { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(await parseError(res));
      setState({ [r]: await res.json() } as Partial<DataState>);
    })
    .finally(() => inflight.delete(r));
  inflight.set(r, p);
  return p;
}

/** Load everything once; concurrent callers share the same requests. */
function loadAll(): { promise: Promise<void>; started: boolean } {
  if (inflightAll) return { promise: inflightAll, started: false };
  const p = (async () => {
    try {
      setState({ error: null });
      await Promise.all([load("accounts"), load("trades"), load("content")]);
      loadedAt = Date.now();
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : "Failed to load data" });
      throw e;
    } finally {
      setState({ loading: false });
      inflightAll = null;
    }
  })();
  inflightAll = p;
  return { promise: p, started: true };
}

export function useData() {
  const { accounts, trades, content, loading, error } = useSyncExternalStore(subscribe, getState, getServerState);
  const toast = useToast();
  // ToastProvider builds a fresh `toast` object on every render; read it
  // through a ref so callbacks stay stable.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const refreshAccounts = useCallback(() => load("accounts"), []);
  /** Reload trades (all accounts — pages filter by the selected account). */
  const refreshTrades = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_accountId?: string | null) => load("trades"),
    [],
  );
  const refreshContent = useCallback(() => load("content"), []);

  const refresh = useCallback(async () => {
    loadedAt = 0;
    const { promise, started } = loadAll();
    try {
      await promise;
    } catch (e) {
      if (started) toastRef.current.error(e instanceof Error ? e.message : "Failed to load data");
    }
  }, []);

  // First mount anywhere loads the data; later mounts reuse it while fresh.
  useEffect(() => {
    if (loadedAt && Date.now() - loadedAt < FRESH_MS) return;
    const { promise, started } = loadAll();
    promise.catch((e) => {
      if (started) toastRef.current.error(e instanceof Error ? e.message : "Failed to load data");
    });
  }, []);

  // Mutations reload into the shared store, so every component sees them at once.

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
