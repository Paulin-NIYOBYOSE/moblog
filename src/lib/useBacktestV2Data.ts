"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastContext";
import { deleteAttachment, updateAttachment, uploadAttachments } from "./attachments";
import type { Attachment, BtItem } from "./types";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function useBacktestV2Data() {
  const [items, setItems] = useState<BtItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // Read toasts through a ref so firing one never rebuilds `refresh`.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/backtesting-v2/items", { cache: "no-store" });
      if (!res.ok) throw new Error(await parseError(res));
      setItems(await res.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load Backtesting v2";
      setError(msg);
      toastRef.current.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const patchItem = useCallback(
    async (id: string, patch: { completed?: boolean; notes?: string | null }) => {
      if (patch.completed !== undefined) {
        // Optimistic so ticking a day feels instant.
        setItems((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, completed: patch.completed!, completedAt: patch.completed ? new Date().toISOString() : null } : i,
          ),
        );
      }
      try {
        const res = await fetch(`/api/backtesting-v2/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(await parseError(res));
        const updated: BtItem = await res.json();
        setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
        if (patch.completed) toastRef.current.success(`${updated.instrument} ${updated.year} marked done`);
        if (patch.notes !== undefined) toastRef.current.success("Notes saved");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to update session");
        await refresh();
      }
    },
    [refresh],
  );

  const mapAttachments = useCallback((itemId: string, fn: (list: Attachment[]) => Attachment[]) => {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, attachments: fn(i.attachments) } : i)));
  }, []);

  const addImages = useCallback(
    async (itemId: string, files: File[]) => {
      if (!files.length) return;
      const toastId = toastRef.current.loading(`Uploading ${files.length} image${files.length === 1 ? "" : "s"}...`);
      try {
        const { uploaded, errors } = await uploadAttachments(files, { btItemId: itemId });
        errors.forEach((e) => toastRef.current.error(e));
        mapAttachments(itemId, (list) => [...list, ...uploaded]);
        if (uploaded.length) toastRef.current.success(`Uploaded ${uploaded.length} image${uploaded.length === 1 ? "" : "s"}`);
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [mapAttachments],
  );

  const removeImage = useCallback(
    async (itemId: string, attachmentId: string) => {
      await deleteAttachment(attachmentId);
      mapAttachments(itemId, (list) => list.filter((a) => a.id !== attachmentId));
      toastRef.current.success("Image deleted");
    },
    [mapAttachments],
  );

  const editImage = useCallback(
    async (itemId: string, attachmentId: string, patch: { name?: string; caption?: string }) => {
      const updated = await updateAttachment(attachmentId, patch);
      mapAttachments(itemId, (list) => list.map((a) => (a.id === attachmentId ? updated : a)));
    },
    [mapAttachments],
  );

  return { items, loading, error, refresh, patchItem, addImages, removeImage, editImage };
}
