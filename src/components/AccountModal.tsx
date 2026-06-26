"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { CURRENCIES } from "@/lib/utils";
import type { AccountInput } from "@/lib/types";

export default function AccountModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: AccountInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [startingBalance, setStartingBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCurrency("USD");
    setStartingBalance("");
    setError(null);
  }, [open]);

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
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm animate-pop-in rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">New account</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
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
            <button type="button" onClick={onClose} className="ml-auto rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
