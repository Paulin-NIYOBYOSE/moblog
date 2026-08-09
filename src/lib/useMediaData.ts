"use client";

import { useCallback, useEffect, useState } from "react";
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

export function useMediaData(folderId: string | null) {
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [images, setImages] = useState<MediaImage[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const qs = folderId ? `?parentId=${encodeURIComponent(folderId)}` : "";
      const [foldersRes, imagesRes] = await Promise.all([
        fetch(`/api/media/folders${qs}`, { cache: "no-store" }),
        fetch(`/api/media/images${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`, {
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
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [folderId, toast]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const createFolder = useCallback(
    async (name: string) => {
      const toastId = toast.loading("Creating folder...");
      try {
        const res = await fetch("/api/media/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, parentId: folderId }),
        });
        if (!res.ok) throw new Error(await parseError(res));
        await refresh();
        toast.success("Folder created");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create folder");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [folderId, refresh, toast],
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
        toast.error(e instanceof Error ? e.message : "Failed to rename folder");
        throw e;
      }
    },
    [refresh, toast],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      const toastId = toast.loading("Deleting folder...");
      try {
        const res = await fetch(`/api/media/folders/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await refresh();
        toast.success("Folder deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete folder");
        throw e;
      } finally {
        toast.remove(toastId);
      }
    },
    [refresh, toast],
  );

  const uploadImages = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      const toastId = toast.loading(`Uploading ${files.length} image${files.length === 1 ? "" : "s"}...`);
      let succeeded = 0;
      try {
        for (const file of files) {
          try {
            const { blob, width, height } = await compressImage(file);
            const form = new FormData();
            form.append("file", blob, file.name);
            if (folderId) form.append("folderId", folderId);
            form.append("name", file.name);
            form.append("width", String(width));
            form.append("height", String(height));
            const res = await fetch("/api/media/images", { method: "POST", body: form });
            if (!res.ok) throw new Error(await parseError(res));
            succeeded += 1;
          } catch (e) {
            toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
          }
        }
        await refresh();
        if (succeeded > 0) toast.success(`Uploaded ${succeeded} image${succeeded === 1 ? "" : "s"}`);
      } finally {
        toast.remove(toastId);
        setUploading(false);
      }
    },
    [folderId, refresh, toast],
  );

  const deleteImage = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/media/images/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await parseError(res));
        await refresh();
        toast.success("Image deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete image");
        throw e;
      }
    },
    [refresh, toast],
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
        toast.error(e instanceof Error ? e.message : "Failed to rename image");
        throw e;
      }
    },
    [refresh, toast],
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
  };
}
