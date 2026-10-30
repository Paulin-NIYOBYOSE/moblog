"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, PiggyBank, Wallet } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Card, { CardHeader } from "@/components/ui/Card";
import Modal, { Field } from "@/components/ui/Modal";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { CURRENCY_OPTIONS, formatMoney, killKey, monthCategories, savingsBalances, type PotKey } from "@/lib/notebook";
import type { BudgetCategory, KillItem } from "@/lib/types";
import type { NotebookApi } from "@/lib/useNotebook";
import { cn } from "@/lib/utils";

/** ‹ label › with an optional "back to now" button. */
export function PeriodNav({ label, onPrev, onNext, onNow, nowLabel, isNow }: { label: ReactNode; onPrev: () => void; onNext: () => void; onNow?: () => void; nowLabel?: string; isNow?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="btn btn-secondary btn-icon btn-sm" onClick={onPrev} aria-label="Previous">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[8.5rem] text-center text-sm font-semibold tabular-nums">{label}</span>
      <button type="button" className="btn btn-secondary btn-icon btn-sm" onClick={onNext} aria-label="Next">
        <ChevronRight className="h-4 w-4" />
      </button>
      {onNow && !isNow && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onNow}>
          {nowLabel ?? "Today"}
        </button>
      )}
    </div>
  );
}

/** Spent-of-planned style bar; turns red past 100 %. `goal` bars fill toward a target (none without one). */
export function ProgressBar({ value, max, className, goal = false }: { value: number; max: number; className?: string; goal?: boolean }) {
  if (goal && max <= 0) return null;
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  const over = !goal && (max > 0 ? value > max : value > 0);
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all duration-500", goal ? (pct >= 100 ? "bg-profit" : "bg-gold") : over ? "bg-loss" : pct >= 85 ? "bg-warning" : "bg-accent")} style={{ width: `${pct}%` }} />
    </div>
  );
}

const BURST = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  const dist = 46 + (i % 3) * 16;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, color: ["var(--accent)", "var(--gold)", "var(--profit)", "var(--chart-2)", "var(--chart-5)"][i % 5] };
});

/** A small burst of confetti each time `fire` goes up. Put it inside a `relative` element. */
export function Burst({ fire }: { fire: number }) {
  const reduce = useReducedMotion();
  if (!fire || reduce) return null;
  return (
    <span key={fire} className="pointer-events-none absolute left-1/2 top-1/2 z-20" aria-hidden>
      {BURST.map((p, i) => (
        <motion.span
          key={i}
          className="absolute h-2 w-2 rounded-full"
          style={{ background: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      ))}
    </span>
  );
}

/** Number field for money, with the currency shown inside. */
export function AmountInput({ value, onChange, currency, placeholder = "0", autoFocus, id, name, large }: { value: string; onChange: (v: string) => void; currency: string | null; placeholder?: string; autoFocus?: boolean; id?: string; name?: string; large?: boolean }) {
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        className={cn("input pr-14 tabular-nums", large && "py-2.5 text-lg font-semibold")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {currency && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-faint">{currency}</span>}
    </div>
  );
}

/** "12.5" → 12.5; "" or invalid → null. */
export function parseAmount(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const categoryLabel = (c: BudgetCategory | null | undefined, none = "Uncategorised") => (c ? `${c.emoji ? `${c.emoji} ` : ""}${c.name}` : none);

/** One tap to pick a category. "" = none. */
export function ChipPicker({ options, value, onChange, label }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value || "none"} type="button" role="radio" aria-checked={value === o.value} data-active={value === o.value} className="chip" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A month's categories as one-tap chips, then "Other". */
export const categoryChips = (categories: BudgetCategory[], month: string) => [...monthCategories(categories, month).map((c) => ({ value: c.id, label: categoryLabel(c) })), { value: "", label: "Other" }];

export function potLabel(key: PotKey | string, killItems: KillItem[]): string {
  if (key.startsWith("k:")) {
    const k = killItems.find((x) => x.id === key.slice(2));
    return k ? `🎯 ${k.name}` : "A deleted item";
  }
  return "🏦 General savings";
}

/** The money tabs start here until a currency is chosen. */
export function CurrencySetup({ nb }: { nb: NotebookApi }) {
  const [currency, setCurrency] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!currency) return;
    setBusy(true);
    try {
      await nb.saveSettings({ currency });
    } catch {
      setBusy(false);
    }
  }
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader icon={Wallet} title="Let's get your money organised" subtitle="First, which currency do you use?" tone="gold" />
      <div className="flex flex-wrap gap-1.5">
        {CURRENCY_OPTIONS.map((c) => (
          <button key={c} type="button" className="chip" data-active={currency === c} onClick={() => setCurrency(c)} data-testid={`currency-${c}`}>
            {c}
          </button>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-primary" disabled={!currency || busy} onClick={() => void save()} data-testid="currency-save">
          Continue
        </button>
      </div>
    </Card>
  );
}

/** Put money aside for a kill-list item — or take some out, to general savings. */
export function SaveModal({ nb, today, item, amount: suggested, onClose }: { nb: NotebookApi; today: string; item: KillItem; amount?: number; onClose: () => void }) {
  const d = nb.data!;
  const currency = d.settings.currency;
  const saved = Math.max(0, savingsBalances(d.entries).get(killKey(item.id)) ?? 0);
  const left = item.price !== null ? Math.max(0, item.price - saved) : null;
  const [mode, setMode] = useState<"saving" | "withdrawal">("saving");
  const [amount, setAmount] = useState(suggested ? String(suggested) : "");
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const n = parseAmount(amount);
    if (!n || !day) return;
    setBusy(true);
    try {
      if (mode === "saving") await nb.createEntry({ day, kind: "saving", amount: n, note: note.trim() || null, killItemId: item.id });
      else await nb.moveSavings({ day, amount: n, from: { killItemId: item.id }, to: {} });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "saving" ? `Save for “${item.name}”` : `Take out of “${item.name}”`}
      subtitle={`${formatMoney(saved, currency)} saved${left !== null ? ` · ${formatMoney(left, currency)} to go` : ""}`}
      icon={PiggyBank}
      size="sm"
      footer={
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !parseAmount(amount) || !day} data-testid="save-confirm">
            {mode === "saving" ? "Put aside" : "Take out"}
          </button>
        </div>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {saved > 0 && (
          <SegmentedControl
            size="md"
            className="w-full [&>button]:flex-1"
            options={[
              { value: "saving", label: "Put aside" },
              { value: "withdrawal", label: "Take out" },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <AmountInput value={amount} onChange={setAmount} currency={currency} autoFocus name="save-amount" />
          </Field>
          <Field label="Date">
            <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
        </div>
        {mode === "saving" && left !== null && left > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[left, Math.round(left / 2), Math.round(left / 4)]
              .filter((x, i, xs) => x > 0 && xs.indexOf(x) === i)
              .map((x, i) => (
                <button key={x} type="button" className="chip" onClick={() => setAmount(String(x))}>
                  {i === 0 ? "All that's left" : i === 1 ? "Half" : "A quarter"} · {formatMoney(x, currency)}
                </button>
              ))}
          </div>
        )}
        {mode === "saving" ? (
          <Field label="Note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="From salary, a bonus…" maxLength={300} />
          </Field>
        ) : (
          <p className="text-xs text-muted">It goes to your general savings.</p>
        )}
      </form>
    </Modal>
  );
}
