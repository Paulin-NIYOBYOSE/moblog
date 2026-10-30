"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ClipboardList, Copy, Minus, PiggyBank, Plus, Sparkles, Trash2, TrendingDown, TrendingUp, Wallet, X } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import Modal, { Field } from "@/components/ui/Modal";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useConfirm } from "@/components/ConfirmContext";
import {
  addMonths,
  dayTitle,
  daysLeftInMonth,
  formatMoney,
  KILL_PURCHASES,
  killKey,
  monthCategories,
  monthName,
  monthOf,
  monthSummary,
  monthTitle,
  openKillItems,
  plannedSaving,
  previousPlan,
  savedInMonth,
  savingsBalances,
  STARTER_CATEGORIES,
} from "@/lib/notebook";
import type { BudgetEntry, BudgetKind, BudgetMonth, KillItem } from "@/lib/types";
import type { NotebookApi } from "@/lib/useNotebook";
import { cn } from "@/lib/utils";
import { AmountInput, categoryChips, categoryLabel, ChipPicker, CurrencySetup, parseAmount, PeriodNav, potLabel, ProgressBar, SaveModal } from "./shared";

type NewEntry = "expense" | "income";

export default function BudgetTab({ nb, today }: { nb: NotebookApi; today: string }) {
  const d = nb.data!;
  const [month, setMonth] = useState(monthOf(today));
  const [planning, setPlanning] = useState(false);
  const [entry, setEntry] = useState<BudgetEntry | NewEntry | null>(null);
  const [saving, setSaving] = useState<{ item: KillItem; amount: number } | null>(null);
  const [copying, setCopying] = useState(false);

  if (!d.settings.currency) return <CurrencySetup nb={nb} />;

  const plan = d.months.find((m) => m.month === month) ?? null;
  const previous = previousPlan(d.months, month);
  const name = monthName(month);
  const entries = d.entries.filter((e) => monthOf(e.day) === month);

  async function copyPrevious() {
    if (!previous) return;
    setCopying(true);
    try {
      await nb.copyMonth(month, previous.month);
    } catch {
      // toasted
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodNav label={monthTitle(month)} onPrev={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))} onNow={() => setMonth(monthOf(today))} nowLabel="This month" isNow={month === monthOf(today)} />
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setEntry("income")} data-testid="add-income">
            <Plus className="h-4 w-4" /> Income
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setEntry("expense")} data-testid="add-expense">
            <Minus className="h-4 w-4" /> Spending
          </button>
        </div>
      </div>

      {plan ? (
        <MonthSheet nb={nb} month={month} plan={plan} today={today} onEdit={() => setPlanning(true)} onSave={(item, amount) => setSaving({ item, amount })} />
      ) : (
        <Card className="border-dashed">
          <CardHeader icon={Sparkles} title={`Plan ${monthTitle(month)}`} subtitle={`Write down what you expect to earn, what you'll spend on each part of life, and what you'll save. ${name}'s plan is its own — other months keep theirs.`} tone="gold" />
          <div className="flex flex-wrap gap-2">
            {previous && (
              <button type="button" className="btn btn-primary" onClick={() => void copyPrevious()} disabled={copying} data-testid="copy-plan">
                <Copy className="h-4 w-4" /> Copy {monthTitle(previous.month)}&apos;s plan
              </button>
            )}
            <button type="button" className={cn("btn", previous ? "btn-secondary" : "btn-primary")} onClick={() => setPlanning(true)} data-testid="start-plan">
              <ClipboardList className="h-4 w-4" /> {previous ? "Start from scratch" : "Plan this month"}
            </button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader icon={ClipboardList} title={`${name}'s money`} subtitle={entries.length ? "What came in, went out or was saved — tap a line to change it." : undefined} />
        {entries.length ? <EntryList entries={entries} nb={nb} onEdit={setEntry} /> : <p className="text-sm text-muted">Nothing written down for {name} yet.</p>}
      </Card>

      {planning && <PlanModal month={month} plan={plan} nb={nb} onClose={() => setPlanning(false)} />}
      {entry && <EntryModal key={typeof entry === "string" ? entry : entry.id} entry={entry} month={month} today={today} nb={nb} onClose={() => setEntry(null)} />}
      {saving && <SaveModal key={saving.item.id} nb={nb} today={today} item={saving.item} amount={saving.amount} onClose={() => setSaving(null)} />}
    </div>
  );
}

function Section({ title, total, children }: { title: string; total?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {total && <span className="text-xs tabular-nums text-muted">{total}</span>}
      </div>
      {children}
    </section>
  );
}

/** The month on one page: the plan beside what really happened — and what it adds to general savings. */
function MonthSheet({ nb, month, plan, today, onEdit, onSave }: { nb: NotebookApi; month: string; plan: BudgetMonth; today: string; onEdit: () => void; onSave: (item: KillItem, amount: number) => void }) {
  const d = nb.data!;
  const money = (v: number) => formatMoney(v, d.settings.currency);
  const s = monthSummary(plan, d.entries, d, month, today);
  const daysLeft = daysLeftInMonth(month, today);
  const isCurrent = month === monthOf(today);
  const toSave = plannedSaving(plan, d);
  const savedNow = savedInMonth(d.entries, month);
  // Kill-list items planned or saved for this month.
  const items = [...new Set([...toSave.keys(), ...savedNow.keys()])]
    .filter((pot) => pot !== "general")
    .map((pot) => ({ pot, item: d.killItems.find((k) => killKey(k.id) === pot) ?? null, planned: toSave.get(pot) ?? 0, saved: savedNow.get(pot) ?? 0 }));
  const toCome = s.expectedIncome - s.receivedIncome;

  return (
    <Card>
      <CardHeader
        icon={Wallet}
        title={`${monthName(month)}'s budget`}
        action={
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit} data-testid="edit-plan">
            <ClipboardList className="h-3.5 w-3.5" /> Edit plan
          </button>
        }
      />
      <div className="rounded-xl bg-surface-2 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="text-sm font-medium text-muted">Left to spend</span>
          <span className={cn("font-display text-2xl tabular-nums", s.left < 0 && "text-loss")} data-testid="budget-left">
            {money(s.left)}
          </span>
        </div>
        <ProgressBar value={s.spent} max={s.plannedSpending} className="mt-2" />
        <p className="mt-1.5 text-xs text-muted">
          <span className="font-semibold text-foreground" data-testid="budget-spent">
            {money(s.spent)}
          </span>{" "}
          spent{s.plannedSpending > 0 && ` of ${money(s.plannedSpending)} planned`}
          {s.left < 0 ? " — over your plan; the extra comes out of general savings" : s.perDay !== null && isCurrent ? ` · about ${money(s.perDay)} a day for ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      <Section title="Income">
        <ul>
          <PlanLine
            label="Received"
            amount={money(s.receivedIncome)}
            planned={s.expectedIncome ? money(s.expectedIncome) : null}
            bar={<ProgressBar value={s.receivedIncome} max={s.expectedIncome} goal />}
            note={!s.receivedIncome ? "Write down your income as it comes in — what you don't plan for goes to general savings." : !s.expectedIncome ? "Add the income you expect in Edit plan." : toCome > 0 ? `${money(toCome)} still to come` : "All in ✓"}
            testId="budget-received"
          />
        </ul>
      </Section>

      <Section title="Spending" total={s.plannedSpending > 0 ? `${money(s.spent)} / ${money(s.plannedSpending)}` : money(s.spent)}>
        {s.lines.length ? (
          <ul className="space-y-3" data-testid="budget-lines">
            {s.lines.map((l) => {
              const special = !l.category || l.category.id === KILL_PURCHASES.id;
              return (
                <PlanLine
                  key={l.category?.id ?? "none"}
                  label={categoryLabel(l.category)}
                  amount={money(l.spent)}
                  planned={l.planned > 0 ? money(l.planned) : null}
                  bar={special ? null : <ProgressBar value={l.spent} max={l.planned} />}
                  note={
                    special
                      ? l.category
                        ? "Kill-list buys, beyond what you'd saved for them"
                        : "Spending without a category"
                      : l.planned === 0
                        ? l.spent > 0
                          ? "Not in the plan"
                          : "Nothing planned"
                        : l.left < 0
                          ? `${money(-l.left)} over`
                          : `${money(l.left)} left`
                  }
                  warn={l.left < 0 && !special}
                />
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No spending lines yet — add them in Edit plan.</p>
        )}
      </Section>

      <Section
        title="Saving"
        total={
          <span data-testid="budget-saved">
            {money(s.saved)}
            {s.plannedSaving > 0 && ` / ${money(s.plannedSaving)}`} for the kill list
          </span>
        }
      >
        <ul className="space-y-3">
          {items.map((r) => {
            const label = r.item ? `🎯 ${r.item.name}` : "A deleted item";
            const left = r.planned - r.saved;
            return (
              <PlanLine
                key={r.pot}
                label={label}
                amount={money(r.saved)}
                planned={r.planned > 0 ? money(r.planned) : null}
                bar={<ProgressBar value={r.saved} max={r.planned} goal />}
                note={r.planned === 0 ? "Not in the plan" : left <= 0 ? "Done ✓" : `${money(left)} to go`}
                testId={`saving-${label}`}
                action={
                  isCurrent &&
                  left > 0 &&
                  r.item &&
                  !r.item.boughtOn && (
                    <button type="button" className="btn btn-ghost btn-sm -my-1" onClick={() => onSave(r.item!, left)}>
                      <PiggyBank className="h-3.5 w-3.5" /> Save
                    </button>
                  )
                }
              />
            );
          })}
          <PlanLine
            label="🏦 General savings"
            amount={s.toGeneral === null ? "—" : formatMoney(s.toGeneral, d.settings.currency, { signed: true })}
            planned={s.toGeneral !== null && s.planToGeneral > 0 ? money(s.planToGeneral) : null}
            bar={s.toGeneral !== null && s.planToGeneral > 0 ? <ProgressBar value={Math.max(0, s.toGeneral)} max={s.planToGeneral} goal /> : null}
            note={
              s.toGeneral === null
                ? `Gets the income you don't plan for${s.planToGeneral > 0 ? ` — about ${money(s.planToGeneral)} by your plan` : ""}.`
                : s.toGeneral < 0
                  ? "You spent more than came in — taken from general savings."
                  : s.closed
                    ? `What was left of ${monthName(month)} — moved to general savings.`
                    : "Income you haven't planned for — added by itself."
            }
            warn={(s.toGeneral ?? 0) < 0}
            testId="budget-general"
          />
        </ul>
      </Section>

      {s.planToGeneral < 0 && <p className="mt-5 rounded-xl bg-loss-soft px-3 py-2 text-xs text-loss">You planned {money(-s.planToGeneral)} more than you expect to earn.</p>}
    </Card>
  );
}

/** One line of the budget: what happened of what was planned, with a bar. */
function PlanLine({ label, amount, planned, bar, note, warn, testId, action }: { label: string; amount: string; planned: string | null; bar: ReactNode; note: string; warn?: boolean; testId?: string; action?: ReactNode }) {
  return (
    <li data-testid={testId}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums">
          {amount}
          {planned && <span className="text-faint"> / {planned}</span>}
        </span>
      </div>
      {bar}
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className={cn("text-[11px]", warn ? "text-loss" : "text-faint")}>{note}</p>
        {action}
      </div>
    </li>
  );
}

function EntryList({ entries, nb, onEdit }: { entries: BudgetEntry[]; nb: NotebookApi; onEdit: (e: BudgetEntry) => void }) {
  const d = nb.data!;
  const currency = d.settings.currency;
  const days = [...new Set(entries.map((e) => e.day))];
  const pot = (e: BudgetEntry) => potLabel(e.killItemId ? killKey(e.killItemId) : "general", d.killItems);
  const what = (e: BudgetEntry) => {
    if (e.kind === "saving") return e.killItemId ? `Saved → ${pot(e)}` : `Moved to ${pot(e)}`;
    if (e.kind === "withdrawal") return `Taken out of ${pot(e)}`;
    if (e.kind === "income") return "Income";
    const line = categoryLabel(d.categories.find((c) => c.id === e.categoryId), e.killItemId ? "🎯 Kill list" : "Uncategorised");
    return `${line}${e.fromSavings ? ` · ${formatMoney(e.fromSavings, currency)} paid from savings` : ""}`;
  };
  return (
    <div className="space-y-4" data-testid="budget-entries">
      {days.map((day) => {
        const list = entries.filter((e) => e.day === day);
        return (
          <div key={day}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{dayTitle(day, { weekday: "short", day: "numeric", month: "short" })}</p>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {list.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => onEdit(e)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.note || what(e)}</span>
                      {e.note && <span className="block truncate text-[11px] text-faint">{what(e)}</span>}
                    </span>
                    <span className={cn("shrink-0 font-semibold tabular-nums", e.kind === "income" && "text-profit", e.kind === "saving" && "text-gold", e.kind === "withdrawal" && "text-muted")}>
                      {e.kind === "income" ? "+" : e.kind === "saving" ? "→ " : e.kind === "withdrawal" ? "← " : "−"}
                      {formatMoney(e.amount, currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

interface PlanRow {
  key: string;
  id: string | null;
  name: string;
  emoji: string;
  planned: string;
  /** Suggested (not yet created) — only created if given an amount. */
  starter: boolean;
}

/**
 * One month's plan: expected income, its spending lines (add, rename,
 * re-plan or remove — this month only) and what to save for each kill-list
 * item. What's left goes to general savings.
 */
function PlanModal({ month, plan, nb, onClose }: { month: string; plan: BudgetMonth | null; nb: NotebookApi; onClose: () => void }) {
  const d = nb.data!;
  const confirm = useConfirm();
  const currency = d.settings.currency;
  const categories = monthCategories(d.categories, month);
  const fresh = !categories.length;
  const [income, setIncome] = useState(plan?.income ? String(plan.income) : "");
  const [rows, setRows] = useState<PlanRow[]>(() =>
    fresh
      ? STARTER_CATEGORIES.map((c, i) => ({ key: `s${i}`, id: null, name: c.name, emoji: c.emoji, planned: "", starter: true }))
      : categories.map((c) => ({ key: c.id, id: c.id, name: c.name, emoji: c.emoji ?? "", planned: c.planned ? String(c.planned) : "", starter: false })),
  );
  // The kill list, target first — with what each item still needs.
  const balances = savingsBalances(d.entries);
  const savingTargets = openKillItems(d.killItems).map((k) => ({ key: killKey(k.id), label: `🎯 ${k.name}`, left: k.price ? Math.max(0, k.price - Math.max(0, balances.get(killKey(k.id)) ?? 0)) : null }));
  const [saving, setSaving] = useState<Record<string, string>>(() => Object.fromEntries(savingTargets.map((t) => [t.key, plan?.plan[t.key] ? String(plan.plan[t.key]) : ""])));
  const [busy, setBusy] = useState(false);

  const plannedSpend = rows.reduce((s, r) => s + (parseAmount(r.planned) ?? 0), 0);
  const plannedSave = Object.values(saving).reduce((s, v) => s + (parseAmount(v) ?? 0), 0);
  const toAssign = (parseAmount(income) ?? 0) - plannedSpend - plannedSave;
  const setRow = (key: string, p: Partial<PlanRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  // Suggestions are only kept if given an amount; a line without a name is dropped.
  const kept = rows.filter((r) => r.name.trim() && !(r.starter && !parseAmount(r.planned)));
  const removed = categories.filter((c) => !kept.some((r) => r.id === c.id));

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (removed.length) {
      const used = removed.filter((c) => d.entries.some((x) => x.categoryId === c.id)).length;
      const ok = await confirm({
        title: `Remove ${removed.map((c) => c.name).join(", ")} from ${monthName(month)}?`,
        message: `Only ${monthName(month)}'s budget changes — other months keep theirs.${used ? ` Spending already written down in ${used === 1 ? "it" : "them"} this month becomes “Uncategorised”.` : ""}`,
        confirmText: "Remove",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await nb.saveMonth(month, {
        income: parseAmount(income) ?? 0,
        categories: kept.map((r) => ({ id: r.id, name: r.name.trim(), emoji: r.emoji.trim() || null, planned: parseAmount(r.planned) ?? 0 })),
        saving: Object.fromEntries(Object.entries(saving).map(([k, v]) => [k, parseAmount(v) ?? 0])),
      });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${monthTitle(month)} plan`}
      subtitle={fresh ? "Fill in what applies to you; leave the rest empty." : `For ${monthName(month)} only — other months keep their own plan.`}
      icon={ClipboardList}
      size="md"
      footer={
        <>
          <span className={cn("text-xs", toAssign < 0 ? "text-loss" : toAssign === 0 && (parseAmount(income) ?? 0) > 0 ? "text-profit" : "text-muted")} data-testid="plan-to-assign">
            {toAssign > 0 ? `${formatMoney(toAssign, currency)} goes to general savings` : toAssign === 0 ? (parseAmount(income) ? "Nothing left for general savings" : "Start with your income") : `${formatMoney(-toAssign, currency)} more than your income`}
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy} data-testid="plan-save">
              Save plan
            </button>
          </div>
        </>
      }
    >
      <form onSubmit={save} className="space-y-5">
        <Field label="Income I expect this month" hint="Salary, business, trading, side work — all together.">
          <AmountInput value={income} onChange={setIncome} currency={currency} autoFocus name="plan-income" />
        </Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">What I&apos;ll spend</span>
            <span className="text-xs font-semibold tabular-nums">{formatMoney(plannedSpend, currency)}</span>
          </div>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[3rem_1fr_8.5rem_2rem] items-center gap-2">
                <input className="input px-1 text-center" value={r.emoji} onChange={(e) => setRow(r.key, { emoji: e.target.value })} placeholder="•" maxLength={8} aria-label="Emoji" />
                <input className="input" value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} placeholder="What for?" maxLength={60} aria-label="Category name" />
                <AmountInput value={r.planned} onChange={(v) => setRow(r.key, { planned: v })} currency={currency} name={`plan-${r.name}`} />
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.name || "line"}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setRows((rs) => [...rs, { key: `n${Date.now()}`, id: null, name: "", emoji: "", planned: "", starter: false }])}>
            <Plus className="h-3.5 w-3.5" /> Add a line
          </button>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted">What I&apos;ll save</span>
            <span className="text-xs font-semibold tabular-nums text-gold">{formatMoney(plannedSave, currency)}</span>
          </div>
          <p className="mb-2 text-[11px] text-faint">{savingTargets.length ? "Put some aside for the things on your kill list (your target first) — what's left goes to general savings." : "Add things to your kill list (General savings) to save for them — what's left goes to general savings."}</p>
          <ul className="space-y-2">
            {savingTargets.map((t) => (
              <li key={t.key} className="grid grid-cols-[1fr_8.5rem_2rem] items-center gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{t.label}</span>
                  {t.left !== null && <span className="block text-[11px] text-faint">{t.left > 0 ? `${formatMoney(t.left, currency)} to go` : "Saved in full ✓"}</span>}
                </span>
                <AmountInput value={saving[t.key] ?? ""} onChange={(v) => setSaving((sv) => ({ ...sv, [t.key]: v }))} currency={currency} name={`plan-save-${t.label}`} />
                <span />
              </li>
            ))}
            <li className="grid grid-cols-[1fr_8.5rem_2rem] items-center gap-2" data-testid="plan-general">
              <span className="min-w-0">
                <span className="block truncate text-sm">🏦 General savings</span>
                <span className="block text-[11px] text-faint">Gets what&apos;s left, by itself</span>
              </span>
              <span className={cn("pr-3 text-right text-sm font-semibold tabular-nums", toAssign < 0 ? "text-loss" : "text-profit")}>{formatMoney(Math.max(0, toAssign), currency)}</span>
              <span />
            </li>
          </ul>
        </div>
      </form>
    </Modal>
  );
}

/** Write down spending or income — or change a line of the month's money. */
function EntryModal({ entry, month, today, nb, onClose }: { entry: BudgetEntry | NewEntry; month: string; today: string; nb: NotebookApi; onClose: () => void }) {
  const d = nb.data!;
  const confirm = useConfirm();
  const existing = typeof entry === "string" ? null : entry;
  const [kind, setKind] = useState<BudgetKind>(existing?.kind ?? (entry as NewEntry));
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [day, setDay] = useState(existing?.day ?? (month === monthOf(today) ? today : `${month}-01`));
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);
  const entryMonth = monthOf(day || today);
  // Categories belong to a month: changing the date to another month clears the choice.
  const chosen = d.categories.some((c) => c.id === categoryId && c.month === entryMonth) ? categoryId : "";
  const purchase = Boolean(existing?.killItemId && existing.kind === "expense");
  const switchable = !existing || ((existing.kind === "income" || existing.kind === "expense") && !existing.fromSavings && !purchase);
  const options = categoryChips(d.categories, entryMonth);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const value = parseAmount(amount);
    if (!value || !day) return;
    setBusy(true);
    try {
      const fields = { amount: value, day, note: note.trim() || null, ...(kind === "expense" ? { categoryId: chosen || null } : {}) };
      if (existing) await nb.updateEntry(existing.id, { ...fields, ...(switchable ? { kind } : {}) });
      else await nb.createEntry({ kind, ...fields });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    const ok = await confirm({ title: "Delete this line?", message: "It's removed from the month.", confirmText: "Delete", destructive: true });
    if (!ok) return;
    await nb.deleteEntry(existing.id).catch(() => undefined);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? "Change this line" : kind === "income" ? "Add income" : "Add spending"}
      icon={kind === "income" ? TrendingUp : TrendingDown}
      size="sm"
      footer={
        <>
          {existing && !purchase && (
            <button type="button" className="btn btn-ghost btn-sm text-loss" onClick={() => void remove()}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !parseAmount(amount) || !day} data-testid="entry-save">
              Save
            </button>
          </div>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {switchable && (
          <SegmentedControl
            size="md"
            className="w-full [&>button]:flex-1"
            options={[
              { value: "expense", label: "Spending" },
              { value: "income", label: "Income" },
            ]}
            value={kind}
            onChange={(k) => {
              setKind(k);
              setCategoryId("");
            }}
          />
        )}
        {purchase && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">This is a kill-list buy — to remove it, use Undo on the kill list.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <AmountInput value={amount} onChange={setAmount} currency={d.settings.currency} autoFocus name="entry-amount" />
          </Field>
          <Field label="Date">
            <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
        </div>
        {kind === "expense" && (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">Category</span>
            {options.length > 1 ? <ChipPicker label="Category" options={options} value={chosen} onChange={setCategoryId} /> : <p className="text-xs text-muted">{monthName(entryMonth)} has no plan yet, so this goes in without a category.</p>}
          </div>
        )}
        <Field label="Note">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "income" ? "Salary, a client, a gift…" : "What was it for?"} maxLength={300} />
        </Field>
      </form>
    </Modal>
  );
}
