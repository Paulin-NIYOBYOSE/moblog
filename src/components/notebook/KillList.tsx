"use client";

import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Crosshair, ExternalLink, Pencil, PiggyBank, Plus, Target, Trash2, Trophy, Undo2 } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Modal, { Field } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Inputs";
import { useConfirm } from "@/components/ConfirmContext";
import { dayTitle, formatMoney, killedItems, killKey, killListCategory, killProgress, killSummary, monthlyNeeded, monthName, monthOf, monthTitle, openKillItems, savedInMonth, savingsBalances } from "@/lib/notebook";
import type { KillItem } from "@/lib/types";
import type { NotebookApi } from "@/lib/useNotebook";
import { cn } from "@/lib/utils";
import { AmountInput, Burst, categoryLabel, parseAmount, ProgressBar, SaveModal } from "./shared";

/** The kill list: the things you save for, most wanted first — each one a saving goal, killed once bought. */
export function KillList({ nb, today }: { nb: NotebookApi; today: string }) {
  const d = nb.data!;
  const currency = d.settings.currency;
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<KillItem | null>(null);
  const [killing, setKilling] = useState<KillItem | null>(null);
  const [saving, setSaving] = useState<{ item: KillItem; amount: number } | null>(null);
  const [showKilled, setShowKilled] = useState(false);
  const [fire, setFire] = useState(0);

  const money = (v: number) => formatMoney(v, currency);
  const open = openKillItems(d.killItems);
  const killed = killedItems(d.killItems);
  const sum = killSummary(d.killItems, d.entries);
  const balances = savingsBalances(d.entries);
  const savedOn = (item: KillItem) => Math.max(0, balances.get(killKey(item.id)) ?? 0);
  // This month's plan: what it sets aside for each item, and what's been put aside so far.
  const month = monthOf(today);
  const plan = d.months.find((m) => m.month === month);
  const savedNow = savedInMonth(d.entries, month);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await nb.createKillItem({ name: name.trim(), price: parseAmount(price) });
      setName("");
      setPrice("");
    } catch {
      // toasted
    } finally {
      setBusy(false);
    }
  }

  const reorder = (ids: string[]) => void nb.reorderKill(ids);
  const move = (i: number, by: number) => {
    const ids = open.map((x) => x.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder(ids);
  };
  const makeTarget = (item: KillItem) => reorder([item.id, ...open.filter((x) => x.id !== item.id).map((x) => x.id)]);

  return (
    <div className="relative space-y-4">
      <Burst fire={fire} />
      <Card>
        <CardHeader
          icon={Target}
          title="Kill list — what you're saving for"
          subtitle={
            open.length ? (
              <>
                {sum.open} to buy{sum.openTotal > 0 && ` · ≈ ${money(sum.openTotal)}`} · <span data-testid="kill-saved">{money(sum.saved)}</span> saved for them
              </>
            ) : (
              "Each thing you want to buy is a saving goal: target one, save for it bit by bit, then kill it."
            )
          }
        />
        <form onSubmit={add} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="What do you want to buy?" maxLength={160} data-testid="kill-name" />
          <div className="flex gap-2">
            <div className="w-40">
              <AmountInput value={price} onChange={setPrice} currency={currency} placeholder="Price" name="kill-price" />
            </div>
            <button type="submit" className="btn btn-primary shrink-0" disabled={busy || !name.trim()} data-testid="kill-add">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </form>

        {!open.length ? (
          <EmptyState icon={Crosshair} title={killed.length ? "Nothing left to buy — well done." : "Your list is empty"} description="Add the things you're saving for: a laptop, a phone, a course… The one at the top is your target." className="py-6" />
        ) : (
          <ol className="space-y-2" data-testid="kill-open">
            {open.map((item, i) => {
              const saved = savedOn(item);
              const p = killProgress(item, saved);
              const perMonth = monthlyNeeded(item.price, saved, item.targetMonth, today);
              const planned = plan?.plan[killKey(item.id)] ?? 0;
              const planLeft = Math.max(0, planned - (savedNow.get(killKey(item.id)) ?? 0));
              return (
                <li key={item.id} className={cn("rounded-xl border px-3 py-2.5", i === 0 ? "border-accent/40 bg-accent-soft/40" : "border-border")} data-testid={`kill-item-${item.name}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold", i === 0 ? "bg-accent text-white" : "bg-surface-3 text-muted")}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium" data-testid={i === 0 ? "kill-target" : undefined}>
                          {item.name}
                        </span>
                        {i === 0 && <span className="shrink-0 rounded bg-accent px-1.5 py-px text-[10px] font-semibold text-white">TARGET</span>}
                        {item.link && (
                          <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-faint hover:text-accent" aria-label="Open link">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span className="tabular-nums">{item.price !== null ? money(item.price) : "No price"}</span>
                        {item.targetMonth && <span className={cn("rounded px-1.5 py-px text-[10px] font-semibold", item.targetMonth < monthOf(today) ? "bg-loss-soft text-loss" : item.targetMonth === monthOf(today) ? "bg-warning-soft text-warning" : "bg-surface-3")}>by {monthTitle(item.targetMonth)}</span>}
                      </div>
                    </div>
                    {/* Own line on phones, so the name keeps its room. */}
                    <div className="flex w-full shrink-0 items-center justify-end gap-0.5 sm:w-auto">
                      {i > 0 && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => makeTarget(item)} title="Save for this one next" data-testid={`kill-target-${item.name}`}>
                          <Crosshair className="h-3.5 w-3.5" /> Target
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${item.name} up`}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, 1)} disabled={i === open.length - 1} aria-label={`Move ${item.name} down`}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm ml-1" onClick={() => setSaving({ item, amount: planLeft })} data-testid={`kill-save-${item.name}`}>
                        <PiggyBank className="h-3.5 w-3.5" /> Save
                      </button>
                      <button type="button" className={cn("btn btn-sm", p.ready ? "btn-primary" : "btn-secondary")} onClick={() => setKilling(item)} data-testid={`kill-it-${item.name}`}>
                        <Crosshair className="h-3.5 w-3.5" /> Kill it
                      </button>
                    </div>
                  </div>
                  {(saved > 0 || item.price !== null || planned > 0) && (
                    <div className="mt-2 pl-10">
                      {item.price !== null && <ProgressBar value={saved} max={item.price} goal />}
                      <p className="mt-1 text-[11px] text-muted">
                        {p.ready ? (
                          <span className="font-semibold text-profit">Saved in full — ready to kill 🎯</span>
                        ) : (
                          <>
                            <span className="font-semibold text-foreground">{money(saved)}</span> saved
                            {p.left !== null && ` · ${money(p.left)} to go`}
                            {perMonth !== null && ` · save ${money(perMonth)} a month to make ${monthName(item.targetMonth!)}`}
                            {planned > 0 && ` · ${monthName(month)}'s plan: ${money(planned)}${planLeft === 0 ? " ✓" : ""}`}
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {killed.length > 0 && (
        <Card padding="sm">
          <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setShowKilled((s) => !s)} aria-expanded={showKilled}>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-gold" /> Killed ({killed.length}){sum.killedTotal > 0 && <span className="font-normal text-muted">· {money(sum.killedTotal)}</span>}
            </span>
            <span className="text-xs text-muted">{showKilled ? "Hide" : "Show"}</span>
          </button>
          {showKilled && (
            <ul className="mt-3 divide-y divide-border" data-testid="kill-killed">
              {killed.map((item) => {
                const purchase = d.entries.find((e) => e.kind === "expense" && e.killItemId === item.id);
                const leftover = savedOn(item);
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-muted line-through decoration-gold/70 decoration-2">{item.name}</span>
                      <span className="text-[11px] text-faint">
                        {dayTitle(item.boughtOn!, { day: "numeric", month: "short", year: "numeric" })}
                        {(item.paid ?? item.price) !== null && ` · ${money((item.paid ?? item.price)!)}`}
                        {purchase?.fromSavings ? ` · ${money(purchase.fromSavings)} from savings` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      {leftover > 0 && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void nb.moveSavings({ day: today, amount: leftover, from: { killItemId: item.id }, to: {} }).catch(() => undefined)} title="Money saved for it that wasn't needed">
                          <PiggyBank className="h-3.5 w-3.5" /> Move {money(leftover)} left over to general savings
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void nb.undoBought(item.id).catch(() => undefined)}>
                        <Undo2 className="h-3.5 w-3.5" /> Undo
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {editing && <KillItemModal key={editing.id} item={editing} nb={nb} onClose={() => setEditing(null)} />}
      {killing && <KillModal key={killing.id} item={killing} nb={nb} today={today} onClose={() => setKilling(null)} onKilled={() => setFire((f) => f + 1)} />}
      {saving && <SaveModal key={saving.item.id} nb={nb} today={today} item={saving.item} amount={saving.amount} onClose={() => setSaving(null)} />}
    </div>
  );
}

function KillItemModal({ item, nb, onClose }: { item: KillItem; nb: NotebookApi; onClose: () => void }) {
  const confirm = useConfirm();
  const currency = nb.data!.settings.currency;
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price !== null ? String(item.price) : "");
  const [targetMonth, setTargetMonth] = useState(item.targetMonth ?? "");
  const [link, setLink] = useState(item.link ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await nb.updateKillItem(item.id, { name: name.trim(), price: parseAmount(price), targetMonth: targetMonth || null, link: link.trim() || null, notes: notes.trim() || null });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({ title: `Remove “${item.name}”?`, message: "It disappears from your kill list. Money you saved for it moves to general savings.", confirmText: "Remove", destructive: true });
    if (!ok) return;
    await nb.deleteKillItem(item.id).catch(() => undefined);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit item"
      icon={Target}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm text-loss" onClick={() => void remove()}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !name.trim()}>
              Save
            </button>
          </div>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        <Field label="What to buy">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price">
            <AmountInput value={price} onChange={setPrice} currency={currency} />
          </Field>
          <Field label="Buy by" hint="Shows what to save each month">
            <input type="month" className="input" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} data-testid="kill-buy-by" />
          </Field>
        </div>
        <Field label="Link" hint="Where to buy it (optional)">
          <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" maxLength={1000} inputMode="url" />
        </Field>
        <Field label="Notes">
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Model, colour, why you need it…" maxLength={2000} />
        </Field>
      </form>
    </Modal>
  );
}

/** Mark an item bought: what you saved for it pays first, the rest comes from that month's money. */
function KillModal({ item, nb, today, onClose, onKilled }: { item: KillItem; nb: NotebookApi; today: string; onClose: () => void; onKilled: () => void }) {
  const d = nb.data!;
  const currency = d.settings.currency;
  const saved = Math.max(0, savingsBalances(d.entries).get(killKey(item.id)) ?? 0);
  const [day, setDay] = useState(today);
  const [paid, setPaid] = useState(item.price !== null ? String(item.price) : "");
  const [useSavings, setUseSavings] = useState(saved > 0);
  const [busy, setBusy] = useState(false);
  const month = monthOf(day || today);
  // The rest goes to that month's "kill list" spending line, if its plan has one.
  const category = killListCategory(d.categories, month);
  const cost = parseAmount(paid) ?? 0;
  const fromSavings = useSavings ? Math.min(saved, cost) : 0;
  const fromMonth = Math.max(0, cost - fromSavings);

  async function kill(e?: FormEvent) {
    e?.preventDefault();
    if (!day) return;
    setBusy(true);
    try {
      await nb.markBought(item.id, { day, paid: parseAmount(paid), categoryId: fromMonth > 0 ? (category?.id ?? null) : null, useSavings });
      onKilled();
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Kill “${item.name}”`}
      subtitle="Bought it? Cross it off — your money stays in order."
      icon={Crosshair}
      size="sm"
      footer={
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void kill()} disabled={busy || !day} data-testid="kill-confirm">
            <Crosshair className="h-4 w-4" /> Kill it
          </button>
        </div>
      }
    >
      <form onSubmit={kill} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bought on">
            <input type="date" className="input" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="What it cost">
            <AmountInput value={paid} onChange={setPaid} currency={currency} autoFocus name="kill-paid" />
          </Field>
        </div>
        {saved > 0 && <Toggle checked={useSavings} onChange={setUseSavings} label={`Pay with the ${formatMoney(saved, currency)} saved for it`} description="Money you already put aside isn't counted twice." />}
        {cost > 0 && (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted" data-testid="kill-split">
            {fromSavings > 0 && (
              <>
                <span className="font-semibold text-gold">{formatMoney(fromSavings, currency)}</span> from savings
                {fromMonth > 0 && " · "}
              </>
            )}
            {fromMonth > 0 && (
              <>
                <span className="font-semibold text-foreground">{formatMoney(fromMonth, currency)}</span> from {monthTitle(month)}&apos;s money ({categoryLabel(category, "🎯 Kill list purchases")})
              </>
            )}
          </p>
        )}
      </form>
    </Modal>
  );
}
