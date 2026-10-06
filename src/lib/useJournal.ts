"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastContext";
import { deleteAttachment, updateAttachment, uploadAttachments } from "./attachments";
import type { JournalEntry, JournalEntryInput } from "./types";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function useJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
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
      const res = await fetch("/api/journal", { cache: "no-store" });
      if (!res.ok) throw new Error(await parseError(res));
      setEntries(await res.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load journal";
      setError(msg);
      toastRef.current.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upsert = useCallback((entry: JournalEntry) => {
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === entry.id);
      const next = exists ? prev.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...prev];
      return next.sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
    });
  }, []);

  /** Creates or updates an entry, then uploads any new images to it. */
  const saveEntry = useCallback(
    async (input: JournalEntryInput, opts: { id?: string; files?: File[] } = {}) => {
      const toastId = toastRef.current.loading(opts.id ? "Saving entry..." : "Creating entry...");
      try {
        const res = await fetch(opts.id ? `/api/journal/${opts.id}` : "/api/journal", {
          method: opts.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await parseError(res));
        let entry: JournalEntry = await res.json();
        if (opts.files?.length) {
          const { uploaded, errors } = await uploadAttachments(opts.files, { journalEntryId: entry.id });
          errors.forEach((e) => toastRef.current.error(e));
          entry = { ...entry, attachments: [...entry.attachments, ...uploaded] };
        }
        upsert(entry);
        toastRef.current.success(opts.id ? "Entry saved" : "Entry created");
        return entry;
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to save entry");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [upsert],
  );

  const deleteEntry = useCallback(async (id: string) => {
    const toastId = toastRef.current.loading("Deleting entry...");
    try {
      const res = await fetch(`/api/journal/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res));
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toastRef.current.success("Entry deleted");
    } catch (e) {
      toastRef.current.error(e instanceof Error ? e.message : "Failed to delete entry");
      throw e;
    } finally {
      toastRef.current.remove(toastId);
    }
  }, []);

  const removeImage = useCallback(async (entryId: string, attachmentId: string) => {
    await deleteAttachment(attachmentId);
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, attachments: e.attachments.filter((a) => a.id !== attachmentId) } : e)),
    );
    toastRef.current.success("Image deleted");
  }, []);

  const editImage = useCallback(async (entryId: string, attachmentId: string, patch: { name?: string; caption?: string }) => {
    const updated = await updateAttachment(attachmentId, patch);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId ? { ...e, attachments: e.attachments.map((a) => (a.id === attachmentId ? updated : a)) } : e,
      ),
    );
  }, []);

  return { entries, loading, error, refresh, saveEntry, deleteEntry, removeImage, editImage };
}
