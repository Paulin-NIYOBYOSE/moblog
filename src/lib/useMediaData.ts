"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastContext";
import { compressImage } from "./media/compress";
import type { Crumb, MediaFolder, MediaImage } from "./media/types";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function useMediaData(folderId: string | null, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [images, setImages] = useState<MediaImage[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  // Toast identity changes on every toast add/remove, so callbacks below read
  // it via this ref instead of depending on it directly — otherwise e.g. a
  // toast fired mid-upload would recreate `refresh` and retrigger the mount
  // effect, flashing the grid back to its loading state.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  // `overrideFolderId` lets a caller refresh a folder it just created, before
  // the new id has propagated back through props. Such a call always runs —
  // the `enabled` gate only suppresses the automatic folderId-driven fetch,
  // and on a first upload this hook is still disabled (no folder existed yet)
  // even though the just-uploaded image must be shown.
  const refresh = useCallback(async (overrideFolderId?: string) => {
    if (!enabled && !overrideFolderId) return;
    const target = overrideFolderId ?? folderId;
    try {
      setError(null);
      const qs = target ? `?parentId=${encodeURIComponent(target)}` : "";
      const [foldersRes, imagesRes] = await Promise.all([
        fetch(`/api/media/folders${qs}`, { cache: "no-store" }),
        fetch(`/api/media/images${target ? `?folderId=${encodeURIComponent(target)}` : ""}`, {
          cache: "no-store",
        }),
      ]);
      if (!foldersRes.ok) throw new Error(await parseError(foldersRes));
      if (!imagesRes.ok) throw new Error(await parseError(imagesRes));
      const foldersData = await foldersRes.json();
      setFolders(foldersData.folders);
      setBreadcrumb(foldersData.breadcrumb);
      setImages(await imagesRes.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load gallery";
      setError(msg);
      toastRef.current.error(msg);
    } finally {
      setLoading(false);
    }
  }, [folderId, enabled]);

  useEffect(() => {
    if (!enabled) {
      // Disabled means "nothing to show" (not "show the root folder"), so
      // clear any results carried over from a previously selected folder.
      setFolders([]);
      setImages([]);
      setBreadcrumb([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh();
  }, [refresh, enabled]);

  const createFolder = useCallback(
    async (name: string) => {
      const toastId = toastRef.current.loading("Creating folder...");
      try {
        const res = await fetch("/api/media/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, parentId: folderId }),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refresh();
        toastRef.current.success("Folder created");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to create folder");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [folderId, refresh],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      try {
        const res = await fetch(`/api/media/folders/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refresh();
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to rename folder");
        throw e;
      }
    },
    [refresh],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      const toastId = toastRef.current.loading("Deleting folder...");
      try {
        const res = await fetch(`/api/media/folders/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await refresh();
        toastRef.current.success("Folder deleted");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to delete folder");
        throw e;
      } finally {
        toastRef.current.remove(toastId);
      }
    },
    [refresh],
  );

  const uploadImages = useCallback(
    // `targetFolderId` overrides the hook's folderId — used when the caller
    // has just created the destination folder and state hasn't updated yet.
    async (files: File[], caption?: string, targetFolderId?: string) => {
      if (files.length === 0) return;
      const destination = targetFolderId ?? folderId;
      setUploading(true);
      const toastId = toastRef.current.loading(`Uploading ${files.length} image${files.length === 1 ? "" : "s"}...`);
      let succeeded = 0;
      try {
        for (const file of files) {
          try {
            const { blob, width, height } = await compressImage(file);
            const form = new FormData();
            form.append("file", blob, file.name);
            if (destination) form.append("folderId", destination);
            form.append("name", file.name);
            form.append("width", String(width));
            form.append("height", String(height));
            if (caption) form.append("caption", caption);
            const res = await fetch("/api/media/images", { method: "POST", body: form });
            if (!res.ok) throw new Error(await parseError(res));
            succeeded += 1;
          } catch (e) {
            toastRef.current.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
          }
        }
        await refresh(destination ?? undefined);
        if (succeeded > 0) toastRef.current.success(`Uploaded ${succeeded} image${succeeded === 1 ? "" : "s"}`);
      } finally {
        toastRef.current.remove(toastId);
        setUploading(false);
      }
    },
    [folderId, refresh],
  );

  const deleteImage = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/media/images/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await refresh();
        toastRef.current.success("Image deleted");
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to delete image");
        throw e;
      }
    },
    [refresh],
  );

  const renameImage = useCallback(
    async (id: string, name: string) => {
      try {
        const res = await fetch(`/api/media/images/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refresh();
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to rename image");
        throw e;
      }
    },
    [refresh],
  );

  const updateCaption = useCallback(
    async (id: string, caption: string) => {
      try {
        const res = await fetch(`/api/media/images/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caption }),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refresh();
      } catch (e) {
        toastRef.current.error(e instanceof Error ? e.message : "Failed to update note");
        throw e;
      }
    },
    [refresh],
  );

  return {
    folders,
    images,
    breadcrumb,
    loading,
    error,
    uploading,
    refresh,
    createFolder,
    renameFolder,
    deleteFolder,
    uploadImages,
    deleteImage,
    renameImage,
    updateCaption,
  };
}
