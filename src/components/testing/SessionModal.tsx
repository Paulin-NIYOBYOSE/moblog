"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CURRENCIES } from "@/lib/utils";
import type { Session, SessionInput } from "@/lib/testing/types";
import CustomSelect from "@/components/CustomSelect";
import { useConfirm } from "@/components/ConfirmContext";
import TagsInput from "./TagsInput";

export default function SessionModal({
  open,
  session,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  session?: Session | null;
  onClose: () => void;
  onSubmit: (input: SessionInput) => Promise<Session | void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [pair, setPair] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [startingBalance, setStartingBalance] = useState("");
  const [strategy, setStrategy] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(session);
  const confirm = useConfirm();

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (session) {
      setName(session.name);
      setPair(session.pair);
      setCurrency(session.currency);
      setStartingBalance(String(session.startingBalance));
      setStrategy(session.strategy ?? "");
      setTags(session.tags);
    } else {
      setName("");
      setPair("");
      setCurrency("USD");
      setStartingBalance("10000");
      setStrategy("");
      setTags([]);
    }
  }, [open, session]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Session name is required.");
      return;
    }
    if (!pair.trim()) {
      setError("Asset / pair is required.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        pair: pair.trim().toUpperCase(),
        currency,
        startingBalance: Number(startingBalance) || 0,
        strategy: strategy.trim() || null,
        tags,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save session");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!session || !onDelete) return;
    const confirmed = await confirm({
      title: "Delete session",
      message: `Delete "${session.name}" and all of its trades? This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await onDelete(session.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
      setDeleting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {isEdit ? "Edit session" : "New session"}
              </h2>
              <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 space-y-3 overflow-y-auto">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Session name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="AUDCHF backtest — 2020"
                  autoFocus
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">Asset / pair</span>
                  <input
                    value={pair}
                    onChange={(e) => setPair(e.target.value.toUpperCase())}
                    className="input uppercase"
                    placeholder="AUDCHF"
                  />
                </label>
                <CustomSelect
                  label="Currency"
                  value={currency}
                  onChange={(v) => setCurrency(v)}
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                />
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Starting balance</span>
                <input
                  type="number"
                  step="any"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  className="input"
                  placeholder="10000"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Strategy</span>
                <input
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="input"
                  placeholder="Breakout, Reversal..."
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Tags</span>
                <TagsInput value={tags} onChange={setTags} />
              </label>

              {error && (
                <p className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p>
              )}

              <div className="flex gap-2 pt-2">
                {isEdit && onDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-loss/30 px-3 py-2 text-sm font-medium text-loss transition-colors hover:bg-loss-soft disabled:opacity-60"
                  >
                    {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-auto rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? "Save" : "Create session"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
