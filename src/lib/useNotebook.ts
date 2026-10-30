"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastContext";
import type { BudgetCategory, BudgetEntry, BudgetKind, BudgetMonth, KillItem, NotebookData, NotebookNote, NotebookSettings } from "./types";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/** Load everything; a database that's waking up or a dropped connection gets two more tries. */
async function fetchNotebook(): Promise<NotebookData> {
  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch("/api/notebook", { cache: "no-store" });
    } catch (e) {
      if (attempt >= 3) throw e;
    }
    if (res?.ok) return res.json();
    if (res && (res.status !== 503 || attempt >= 3)) throw new Error(await parseError(res));
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const upsertBy = <T,>(list: T[], item: T, key: (x: T) => string) => (list.some((x) => key(x) === key(item)) ? list.map((x) => (key(x) === key(item) ? item : x)) : [item, ...list]);

const sortEntries = (list: BudgetEntry[]) => list.sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));

const ENTRY_SAVED: Record<BudgetKind, string> = { income: "Income added", expense: "Spending added", saving: "Saved 💰", withdrawal: "Taken out of savings" };

/** A new money entry. A saving or withdrawal names its kill-list item. */
export interface EntryInput {
  day: string;
  kind: BudgetKind;
  amount: number;
  categoryId?: string | null;
  note?: string | null;
  killItemId?: string | null;
}

/** A savings pot in requests: {} = general savings. */
export type PotRef = { killItemId?: string };

export type NotebookApi = ReturnType<typeof useNotebook>;

/**
 * The whole notebook, loaded once. Every change is saved to the server and
 * applied locally from its answer; notes and reordering are applied first and
 * rolled back if the save fails.
 */
export function useNotebook() {
  const [data, setData] = useState<NotebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // Read toasts through a ref so a fired toast never rebuilds `refresh` and
  // retriggers the mount fetch (same pattern as useData).
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchNotebook());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the notebook");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchNotebook()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load the notebook");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const patch = useCallback((fn: (d: NotebookData) => NotebookData) => setData((d) => (d ? fn(d) : d)), []);

  /** Run a save; toast its error (and rethrow so forms stay open). */
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T> => {
    try {
      const out = await fn();
      if (success) toastRef.current.success(success);
      return out;
    } catch (e) {
      toastRef.current.error(e instanceof Error ? e.message : "Couldn't save");
      throw e;
    }
  }, []);

  /** Apply a change now, save it, and reload the server's state if the save fails. */
  const optimistic = useCallback(
    async (apply: (d: NotebookData) => NotebookData, save: () => Promise<unknown>, failure: string) => {
      patch(apply);
      try {
        await save();
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : failure);
        void refresh();
      }
    },
    [patch, refresh],
  );

  // ---- Settings -------------------------------------------------------------

  const saveSettings = useCallback(
    (settings: Partial<NotebookSettings>) =>
      run(async () => {
        const s = await call<NotebookSettings>("/api/notebook/settings", "PUT", settings);
        patch((d) => ({ ...d, settings: s }));
        return s;
      }),
    [run, patch],
  );

  // ---- Kill list ----------------------------------------------------------

  const setKill = useCallback((item: KillItem) => patch((d) => ({ ...d, killItems: upsertBy(d.killItems, item, (x) => x.id) })), [patch]);

  const createKillItem = useCallback(
    (input: Partial<Omit<KillItem, "id" | "createdAt" | "position">> & { name: string }) =>
      run(async () => {
        const item = await call<KillItem>("/api/notebook/kill", "POST", input);
        setKill(item);
        return item;
      }, "Added to your kill list"),
    [run, setKill],
  );

  const updateKillItem = useCallback(
    (id: string, fields: Partial<Omit<KillItem, "id" | "createdAt">>) =>
      run(async () => {
        const item = await call<KillItem>(`/api/notebook/kill/${id}`, "PUT", fields);
        setKill(item);
        return item;
      }),
    [run, setKill],
  );

  const deleteKillItem = useCallback(
    (id: string) =>
      run(async () => {
        await call(`/api/notebook/kill/${id}`, "DELETE");
        // Its savings go to general savings; a recorded purchase stays — without the link.
        patch((d) => ({ ...d, killItems: d.killItems.filter((i) => i.id !== id), entries: d.entries.map((e) => (e.killItemId === id ? { ...e, killItemId: null } : e)) }));
      }, "Removed from the list"),
    [run, patch],
  );

  /** New priority order of the open items (first = the one you're targeting). */
  const reorderKill = useCallback(
    (ids: string[]) =>
      optimistic(
        (d) => ({ ...d, killItems: d.killItems.map((i) => (ids.includes(i.id) ? { ...i, position: ids.indexOf(i.id) } : i)) }),
        () => call("/api/notebook/kill/order", "PUT", { ids }),
        "Couldn't save the new order",
      ),
    [optimistic],
  );

  const markBought = useCallback(
    (id: string, input: { day: string; paid: number | null; categoryId: string | null; useSavings: boolean }) =>
      run(async () => {
        const r = await call<{ item: KillItem; entry: BudgetEntry | null; removedEntryId: string | null }>(`/api/notebook/kill/${id}/bought`, "PUT", input);
        patch((d) => {
          let entries = d.entries.filter((e) => e.id !== r.removedEntryId);
          if (r.entry) entries = sortEntries(upsertBy(entries, r.entry, (x) => x.id));
          return { ...d, killItems: upsertBy(d.killItems, r.item, (x) => x.id), entries };
        });
        return r.item;
      }, "Killed it 🎯"),
    [run, patch],
  );

  const undoBought = useCallback(
    (id: string) =>
      run(async () => {
        const r = await call<{ item: KillItem; removedEntryId: string | null }>(`/api/notebook/kill/${id}/bought`, "DELETE");
        patch((d) => ({ ...d, killItems: upsertBy(d.killItems, r.item, (x) => x.id), entries: d.entries.filter((e) => e.id !== r.removedEntryId) }));
      }, "Back on the list"),
    [run, patch],
  );

  // ---- Savings ------------------------------------------------------------

  const moveSavings = useCallback(
    (input: { day: string; amount: number; from: PotRef; to: PotRef }) =>
      run(async () => {
        const r = await call<{ entries: BudgetEntry[] }>("/api/notebook/savings/move", "POST", input);
        patch((d) => ({ ...d, entries: sortEntries([...r.entries, ...d.entries]) }));
      }, "Moved to general savings"),
    [run, patch],
  );

  // ---- Budget ---------------------------------------------------------------

  /** Apply a month's saved plan and its categories (other months are untouched). */
  const setMonth = useCallback(
    (r: { month: BudgetMonth; categories: BudgetCategory[] }) =>
      patch((d) => ({
        ...d,
        months: upsertBy(d.months, r.month, (x) => x.month),
        categories: [...d.categories.filter((c) => c.month !== r.month.month), ...r.categories],
        entries: d.entries.map((e) => (e.categoryId && e.day.startsWith(r.month.month) && !r.categories.some((c) => c.id === e.categoryId) ? { ...e, categoryId: null } : e)),
      })),
    [patch],
  );

  /** One month's plan: expected income, its spending categories (this month only) and planned saving per target. */
  const saveMonth = useCallback(
    (month: string, input: { income: number; categories?: { id?: string | null; name: string; emoji: string | null; planned: number }[]; saving: Record<string, number> }) =>
      run(async () => {
        const r = await call<{ month: BudgetMonth; categories: BudgetCategory[] }>(`/api/notebook/budget/months/${month}`, "PUT", input);
        setMonth(r);
        return r.month;
      }),
    [run, setMonth],
  );

  /** Start `month` from another month's budget. */
  const copyMonth = useCallback(
    (month: string, from: string) =>
      run(async () => {
        const r = await call<{ month: BudgetMonth; categories: BudgetCategory[] }>(`/api/notebook/budget/months/${month}/copy`, "POST", { from });
        setMonth(r);
        return r.month;
      }, "Budget copied — change anything you like"),
    [run, setMonth],
  );

  const createEntry = useCallback(
    (input: EntryInput) =>
      run(async () => {
        const e = await call<BudgetEntry>("/api/notebook/budget/entries", "POST", input);
        patch((d) => ({ ...d, entries: sortEntries([e, ...d.entries]) }));
        return e;
      }, ENTRY_SAVED[input.kind]),
    [run, patch],
  );

  const updateEntry = useCallback(
    (id: string, fields: Partial<Pick<BudgetEntry, "day" | "kind" | "amount" | "categoryId" | "note">>) =>
      run(async () => {
        const e = await call<BudgetEntry>(`/api/notebook/budget/entries/${id}`, "PUT", fields);
        patch((d) => ({ ...d, entries: sortEntries(d.entries.map((x) => (x.id === id ? e : x))) }));
        return e;
      }, "Saved"),
    [run, patch],
  );

  const deleteEntry = useCallback(
    (id: string) =>
      run(async () => {
        await call(`/api/notebook/budget/entries/${id}`, "DELETE");
        patch((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
      }, "Deleted"),
    [run, patch],
  );

  // ---- Notes ----------------------------------------------------------------

  /** Write a note on a day: it shows at once (as "tmp-…") and gets its id once saved. */
  const createNote = useCallback(
    async (day: string, text: string) => {
      const temp: NotebookNote = { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, day, text, done: false, createdAt: new Date().toISOString() };
      patch((d) => ({ ...d, notes: [...d.notes, temp] }));
      try {
        const note = await call<NotebookNote>("/api/notebook/notes", "POST", { day, text });
        patch((d) => ({ ...d, notes: d.notes.map((n) => (n.id === temp.id ? note : n)) }));
      } catch (e) {
        patch((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== temp.id) }));
        toastRef.current.error(e instanceof Error ? e.message : "Couldn't save the note");
      }
    },
    [patch],
  );

  const updateNote = useCallback(
    (id: string, fields: Partial<Pick<NotebookNote, "text" | "done" | "day">>) =>
      optimistic((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, ...fields } : n)) }), () => call(`/api/notebook/notes/${id}`, "PUT", fields), "Couldn't save the note"),
    [optimistic],
  );

  const deleteNote = useCallback(
    (id: string) => optimistic((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }), () => call(`/api/notebook/notes/${id}`, "DELETE"), "Couldn't delete the note"),
    [optimistic],
  );

  return {
    data,
    loading,
    error,
    refresh,
    saveSettings,
    createKillItem,
    updateKillItem,
    deleteKillItem,
    reorderKill,
    markBought,
    undoBought,
    moveSavings,
    saveMonth,
    copyMonth,
    createEntry,
    updateEntry,
    deleteEntry,
    createNote,
    updateNote,
    deleteNote,
  };
}
