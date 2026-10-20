"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { listDatasets, listSessions, listStrategies } from "./storage/repo";
import type { DatasetMeta, ReplaySession, StrategyTemplate } from "./types";

// Data hooks over Replay's server API. Any write anywhere calls
// `notifyReplayChanged()` so every mounted list refreshes.
//
// Each list lives in one shared store: pages that use the same list share one
// copy and one request, and navigating back to a page shows the cached list at
// once while it refreshes quietly in the background (stale-while-revalidate).

const EVENT = "replay-db-changed";
/** A list younger than this is shown without refetching when a page mounts. */
const FRESH_MS = 15_000;

export function notifyReplayChanged() {
  if (typeof window === "undefined") return;
  // Mark every list stale first, so pages mounted later refetch too.
  for (const s of stores.values()) s.loadedAt = 0;
  window.dispatchEvent(new CustomEvent(EVENT));
}

interface ListState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
}

interface Store<T> {
  state: ListState<T>;
  listeners: Set<() => void>;
  inflight: Promise<void> | null;
  loadedAt: number;
  load: () => Promise<T[]>;
}

const INITIAL: ListState<never> = { items: [], loading: true, error: null };
const stores = new Map<string, Store<unknown>>();

function storeFor<T>(key: string, load: () => Promise<T[]>): Store<T> {
  let s = stores.get(key) as Store<T> | undefined;
  if (!s) {
    s = { state: INITIAL, listeners: new Set(), inflight: null, loadedAt: 0, load };
    stores.set(key, s as Store<unknown>);
  }
  return s;
}

function setState<T>(s: Store<T>, patch: Partial<ListState<T>>) {
  s.state = { ...s.state, ...patch };
  for (const l of s.listeners) l();
}

/** Fetch once; concurrent callers share the request. Errors keep the last good list. */
function refresh<T>(s: Store<T>): Promise<void> {
  if (s.inflight) return s.inflight;
  s.inflight = s
    .load()
    .then((items) => {
      s.loadedAt = Date.now();
      setState(s, { items, loading: false, error: null });
    })
    .catch((e) => setState(s, { loading: false, error: e instanceof Error ? e.message : String(e) }))
    .finally(() => {
      s.inflight = null;
    });
  return s.inflight;
}

function useApiList<T>(key: string, load: () => Promise<T[]>) {
  const s = storeFor(key, load);
  const subscribe = useCallback(
    (fn: () => void) => {
      s.listeners.add(fn);
      return () => {
        s.listeners.delete(fn);
      };
    },
    [s],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => s.state,
    () => INITIAL as ListState<T>,
  );

  useEffect(() => {
    if (Date.now() - s.loadedAt > FRESH_MS) void refresh(s);
    const on = () => void refresh(s);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [s]);

  const reload = useCallback(() => refresh(s), [s]);
  return { items: state.items, loading: state.loading, error: state.error, refresh: reload };
}

export function useDatasets() {
  const { items, ...rest } = useApiList<DatasetMeta>("datasets", listDatasets);
  return { datasets: items, ...rest };
}

const listSummary = () => listSessions("summary");
const listAnalytics = () => listSessions("analytics");

/** "summary" omits ledgers; "analytics" includes ledgers and journals (no screenshots). */
export function useSessions(view: "summary" | "analytics" = "summary") {
  const { items, ...rest } = useApiList<ReplaySession>(`sessions:${view}`, view === "analytics" ? listAnalytics : listSummary);
  return { sessions: items, ...rest };
}

export function useStrategies() {
  const { items, ...rest } = useApiList<StrategyTemplate>("strategies", listStrategies);
  return { strategies: items, ...rest };
}
