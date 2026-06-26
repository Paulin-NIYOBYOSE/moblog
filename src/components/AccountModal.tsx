"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { CURRENCIES } from "@/lib/utils";
import type { Account, AccountInput } from "@/lib/types";

export default function AccountModal({
  open,
  account,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  account?: Account | null;
  onClose: () => void;
  onSubmit: (input: AccountInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [startingBalance, setStartingBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(account);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (account) {
      setName(account.name);
      setCurrency(account.currency);
      setStartingBalance(String(account.startingBalance));
    } else {
      setName("");
      setCurrency("USD");
      setStartingBalance("");
    }
  }, [open, account]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Account name is required.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        currency,
        startingBalance: Number(startingBalance) || 0,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!account || !onDelete) return;
    if (!window.confirm("Delete this account and all its trades? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await onDelete(account.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-sm flex-col animate-pop-in rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{isEdit ? "Edit account" : "New account"}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Account name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Prop Challenge May" autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Starting balance</span>
              <input type="number" step="any" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} className="input" placeholder="10000" />
            </label>
          </div>
          {error && <p className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p>}
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
            <button type="button" onClick={onClose} className="ml-auto rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {isEdit ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
