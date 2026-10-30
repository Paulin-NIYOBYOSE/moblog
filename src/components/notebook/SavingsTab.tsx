"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, Landmark, PiggyBank, Target } from "lucide-react";
import Card from "@/components/ui/Card";
import Modal, { Field } from "@/components/ui/Modal";
import { formatMoney, generalSavings, monthName, monthOf, monthSummary, monthTitle, savedForItems } from "@/lib/notebook";
import type { NotebookApi } from "@/lib/useNotebook";
import { cn } from "@/lib/utils";
import { KillList } from "./KillList";
import { AmountInput, CurrencySetup, parseAmount, ProgressBar } from "./shared";

/** General savings — fed by what each month doesn't plan for — and the kill list, the things you save for. */
export default function SavingsTab({ nb, today }: { nb: NotebookApi; today: string }) {
  const d = nb.data!;
  const [editing, setEditing] = useState(false);
  const [showHow, setShowHow] = useState(false);
  if (!d.settings.currency) return <CurrencySetup nb={nb} />;

  const currency = d.settings.currency;
  const money = (v: number) => formatMoney(v, currency);
  const signed = (v: number) => formatMoney(v, currency, { signed: true });
  const g = generalSavings(d, today);
  const forItems = savedForItems(d.entries);
  const goal = d.settings.generalGoal;
  const month = monthOf(today);
  const s = monthSummary(d.months.find((m) => m.month === month) ?? null, d.entries, d, month, today);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
              <Landmark className="h-4 w-4 text-profit" /> General savings
            </p>
            <p className={cn("mt-1 font-display text-3xl tabular-nums", g.balance < 0 && "text-loss")} data-testid="general-balance">
              {money(g.balance)}
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)} data-testid="general-edit">
            <Target className="h-3.5 w-3.5" /> {goal ? "Edit goal" : "Set a goal"}
          </button>
        </div>
        {goal !== null && (
          <div className="mt-3" data-testid="general-goal">
            <ProgressBar value={Math.max(0, g.balance)} max={goal} goal className="h-2" />
            <p className="mt-1.5 text-xs text-muted">
              {g.balance >= goal ? (
                <span className="font-semibold text-profit">Goal of {money(goal)} reached 🎉</span>
              ) : (
                <>
                  {Math.max(0, Math.floor((g.balance / goal) * 100))}% of your {money(goal)} goal · {money(goal - g.balance)} to go
                </>
              )}
            </p>
          </div>
        )}
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
          Income you don&apos;t plan for — for spending or for your kill list — comes here by itself, and so does whatever is left when a month ends.{" "}
          <span className="font-medium text-foreground" data-testid="general-this-month">
            {s.toGeneral === null ? `${monthName(month)}: write down your income to see its share.` : `${monthName(month)} so far: ${signed(s.toGeneral)}.`}
          </span>
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <button type="button" className="flex items-center gap-1 font-medium text-muted hover:text-foreground" onClick={() => setShowHow((x) => !x)} aria-expanded={showHow}>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showHow && "rotate-180")} /> How it adds up
          </button>
          <span className="text-muted">
            All your savings:{" "}
            <span className="font-semibold text-foreground" data-testid="savings-total">
              {money(g.balance + forItems)}
            </span>{" "}
            — {money(forItems)} of it for the kill list
          </span>
        </div>
        {showHow && (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm" data-testid="general-how">
            {g.start > 0 && <Row label="Savings you already had" amount={signed(g.start)} />}
            {g.moved !== 0 && <Row label="Moved here from the kill list" amount={signed(g.moved)} loss={g.moved < 0} />}
            {g.months.map((m) => (
              <Row key={m.month} label={`${monthTitle(m.month)} — ${m.closed ? "what was left" : "so far"}`} amount={signed(m.amount)} loss={m.amount < 0} />
            ))}
            {!g.start && !g.moved && !g.months.length && <li className="px-3 py-2 text-muted">Nothing yet — write down your income in the budget.</li>}
          </ul>
        )}
      </Card>

      <KillList nb={nb} today={today} />
      {editing && <GeneralModal nb={nb} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Row({ label, amount, loss }: { label: string; amount: string; loss?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="min-w-0 truncate text-muted">{label}</span>
      <span className={cn("shrink-0 font-semibold tabular-nums", loss ? "text-loss" : "text-profit")}>{amount}</span>
    </li>
  );
}

/** The general savings goal, and the savings you already had when you started. */
function GeneralModal({ nb, onClose }: { nb: NotebookApi; onClose: () => void }) {
  const { currency, generalGoal, generalStart } = nb.data!.settings;
  const [goal, setGoal] = useState(generalGoal ? String(generalGoal) : "");
  const [start, setStart] = useState(generalStart ? String(generalStart) : "");
  const [busy, setBusy] = useState(false);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      await nb.saveSettings({ generalGoal: parseAmount(goal), generalStart: parseAmount(start) });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="General savings"
      subtitle="Set the total you want to reach, and track how close you are."
      icon={PiggyBank}
      size="sm"
      footer={
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy} data-testid="general-save">
            Save
          </button>
        </div>
      }
    >
      <form onSubmit={save} className="space-y-4">
        <Field label="My goal" hint="The total I want in general savings — leave it empty for none.">
          <AmountInput value={goal} onChange={setGoal} currency={currency} autoFocus name="general-goal" />
        </Field>
        <Field label="Savings I already had" hint="What you had saved before you started this notebook.">
          <AmountInput value={start} onChange={setStart} currency={currency} name="general-start" />
        </Field>
      </form>
    </Modal>
  );
}
