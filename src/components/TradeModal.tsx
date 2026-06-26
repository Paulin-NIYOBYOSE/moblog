"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Loader2,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import type { Account, Direction, Trade, TradeInput } from "@/lib/types";
import { cn, todayKey } from "@/lib/utils";

interface TradeModalProps {
  open: boolean;
  accounts: Account[];
  trade?: Trade | null;
  defaultDate?: string | null;
  defaultAccountId?: string | null;
  onClose: () => void;
  onSubmit: (input: TradeInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const EMPTY: Record<string, string> = {
  accountId: "",
  openDate: todayKey(),
  closeDate: "",
  pair: "",
  direction: "LONG",
  exitLogic: "",
  pnl: "",
  roi: "",
  rr: "",
  entry: "",
  exit: "",
  stopLoss: "",
  takeProfit: "",
  size: "",
  riskAmount: "",
  setup: "",
  comment: "",
  chartUrl: "",
};

const EXIT_LOGIC_PRESETS = [
  "Full TP",
  "BCS full TP",
  "WCS direction",
  "Close after confirmation",
  "Stop loss",
  "Break-even",
  "Manual close",
  "Time stop",
];

export default function TradeModal({
  open,
  accounts,
  trade,
  defaultDate,
  defaultAccountId,
  onClose,
  onSubmit,
  onDelete,
}: TradeModalProps) {
  const [form, setForm] = useState(EMPTY);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pairRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(trade);

  const accountId =
    form.accountId ||
    defaultAccountId ||
    accounts[0]?.id ||
    "";

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowMore(false);
    if (trade) {
      setForm({
        accountId: trade.accountId,
        openDate: trade.openDate.slice(0, 10),
        closeDate: trade.closeDate ? trade.closeDate.slice(0, 10) : "",
        pair: trade.pair,
        direction: trade.direction,
        exitLogic: trade.exitLogic ?? "",
        pnl: String(trade.pnl),
        roi: trade.roi?.toString() ?? "",
        rr: trade.rr?.toString() ?? "",
        entry: trade.entry?.toString() ?? "",
        exit: trade.exit?.toString() ?? "",
        stopLoss: trade.stopLoss?.toString() ?? "",
        takeProfit: trade.takeProfit?.toString() ?? "",
        size: trade.size?.toString() ?? "",
        riskAmount: trade.riskAmount?.toString() ?? "",
        setup: trade.setup ?? "",
        comment: trade.comment ?? "",
        chartUrl: trade.chartUrl ?? "",
      });
    } else {
      setForm({
        ...EMPTY,
        accountId: defaultAccountId || accounts[0]?.id || "",
        openDate: defaultDate ?? todayKey(),
      });
    }
    const t = setTimeout(() => pairRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open, trade, defaultDate, defaultAccountId, accounts]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toNumOrNull(value: string): number | null {
    return value === "" || value === null || value === undefined ? null : Number(value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const activeAccount = form.accountId || defaultAccountId || accounts[0]?.id;
    if (!activeAccount) {
      setError("Please create an account first.");
      return;
    }
    const pair = form.pair.trim().toUpperCase();
    if (!pair) {
      setError("Pair is required.");
      return;
    }
    if (form.pnl === "" || Number.isNaN(Number(form.pnl))) {
      setError("Enter a valid Net P&L.");
      return;
    }

    setSaving(true);
    try {
      const input: TradeInput = {
        accountId: activeAccount,
        openDate: form.openDate,
        closeDate: form.closeDate || null,
        pair,
        direction: (form.direction as Direction) || "LONG",
        exitLogic: form.exitLogic.trim() || null,
        pnl: Number(form.pnl),
        roi: toNumOrNull(form.roi),
        rr: toNumOrNull(form.rr),
        entry: toNumOrNull(form.entry),
        exit: toNumOrNull(form.exit),
        stopLoss: toNumOrNull(form.stopLoss),
        takeProfit: toNumOrNull(form.takeProfit),
        size: toNumOrNull(form.size),
        riskAmount: toNumOrNull(form.riskAmount),
        setup: form.setup.trim() || null,
        comment: form.comment.trim() || null,
        chartUrl: form.chartUrl.trim() || null,
      };
      await onSubmit(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!trade || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(trade.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative z-10 flex h-[90vh] w-full max-w-2xl flex-col animate-pop-in rounded-t-2xl border border-border bg-card shadow-2xl sm:h-auto sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">{isEdit ? "Edit trade" : "Add trade"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Account */}
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-muted">Account</span>
              <select value={accountId} onChange={(e) => set("accountId", e.target.value)} className="input">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>

            {/* Direction */}
            <div className="sm:col-span-2">
              <div className="grid grid-cols-2 gap-2">
                <DirButton active={form.direction === "LONG"} tone="profit" icon={TrendingUp} label="Long" onClick={() => set("direction", "LONG")} />
                <DirButton active={form.direction === "SHORT"} tone="loss" icon={TrendingDown} label="Short" onClick={() => set("direction", "SHORT")} />
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Pair</span>
              <input ref={pairRef} value={form.pair} onChange={(e) => set("pair", e.target.value.toUpperCase())} className="input uppercase" placeholder="EUR/USD" autoComplete="off" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Open date</span>
              <input type="date" value={form.openDate} onChange={(e) => set("openDate", e.target.value)} className="input" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Net P&L</span>
              <input type="number" step="any" inputMode="decimal" value={form.pnl} onChange={(e) => set("pnl", e.target.value)} className="input font-semibold" placeholder="250 or -120" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Close date</span>
              <input type="date" value={form.closeDate} onChange={(e) => set("closeDate", e.target.value)} className="input" />
              <p className="mt-1 text-[11px] text-muted">Leave blank to keep the trade open.</p>
            </label>

            {/* Exit logic + chips */}
            <div className="sm:col-span-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Exit logic</span>
                <input value={form.exitLogic} onChange={(e) => set("exitLogic", e.target.value)} className="input" placeholder="How or why you exited" autoComplete="off" />
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXIT_LOGIC_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => set("exitLogic", preset)}
                    className="rounded-md border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            className="mt-4 flex w-full items-center justify-between rounded-lg px-1 py-1 text-sm text-muted transition-colors hover:text-foreground"
          >
            <span>More details (optional)</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />
          </button>

          {showMore && (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 animate-fade-in">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">ROI %</span>
                <input type="number" step="any" value={form.roi} onChange={(e) => set("roi", e.target.value)} className="input" placeholder="2.0" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">R:R</span>
                <input type="number" step="any" value={form.rr} onChange={(e) => set("rr", e.target.value)} className="input" placeholder="2 or -1" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Entry</span>
                <input type="number" step="any" value={form.entry} onChange={(e) => set("entry", e.target.value)} className="input" placeholder="0.00" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Exit</span>
                <input type="number" step="any" value={form.exit} onChange={(e) => set("exit", e.target.value)} className="input" placeholder="0.00" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Stop loss</span>
                <input type="number" step="any" value={form.stopLoss} onChange={(e) => set("stopLoss", e.target.value)} className="input" placeholder="0.00" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Take profit</span>
                <input type="number" step="any" value={form.takeProfit} onChange={(e) => set("takeProfit", e.target.value)} className="input" placeholder="0.00" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Size / lots</span>
                <input type="number" step="any" value={form.size} onChange={(e) => set("size", e.target.value)} className="input" placeholder="0.00" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Risk amount</span>
                <input type="number" step="any" value={form.riskAmount} onChange={(e) => set("riskAmount", e.target.value)} className="input" placeholder="0.00" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-muted">Setup / strategy</span>
                <input value={form.setup} onChange={(e) => set("setup", e.target.value)} className="input" placeholder="Breakout, Reversal..." autoComplete="off" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-muted">Chart link</span>
                <input type="url" value={form.chartUrl} onChange={(e) => set("chartUrl", e.target.value)} className="input" placeholder="https://www.tradingview.com/..." />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-muted">Comment</span>
                <textarea value={form.comment} onChange={(e) => set("comment", e.target.value)} className="input min-h-[72px] resize-none" placeholder="What was your thesis? How did you execute?" />
              </label>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p>
          )}

          <div className="mt-5 flex items-center gap-2">
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-loss transition-colors hover:bg-loss-soft disabled:opacity-50"
                aria-label="Delete trade"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-transform hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save changes" : "Add trade"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DirButton({
  active,
  tone,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  tone: "profit" | "loss";
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-all",
        active ? "border-transparent" : "border-border text-muted hover:text-foreground",
      )}
      style={
        active
          ? {
              backgroundColor: tone === "profit" ? "var(--profit-soft)" : "var(--loss-soft)",
              color: tone === "profit" ? "var(--profit)" : "var(--loss)",
              boxShadow: `inset 0 0 0 1px ${tone === "profit" ? "var(--profit)" : "var(--loss)"}`,
            }
          : undefined
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
