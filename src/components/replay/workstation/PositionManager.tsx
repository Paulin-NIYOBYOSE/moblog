"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import Modal from "@/components/ui/Modal";
import type { ControllerSnapshot, NewCommand } from "@/lib/replay/controller";
import type { ApplyResult } from "@/lib/replay/engine";
import { levelStats } from "@/lib/replay/positionMath";
import { floorLots, MIN_LOT } from "@/lib/replay/sizing";
import { formatInTz } from "@/lib/replay/time";
import { cn } from "@/lib/utils";
import { fmtR, money, parsePrice, tone } from "../format";

const PARTS = [25, 50, 75, 100];

/**
 * "Manage position" (TradingView's edit-position dialog): close part of a
 * running trade, then set the stop and target for what remains.
 */
export default function PositionManager({ snap, positionId, onSubmit, onClose }: { snap: ControllerSnapshot; positionId: string; onSubmit: (cmd: NewCommand) => ApplyResult; onClose: () => void }) {
  const pos = snap.positions.find((p) => p.id === positionId);
  const { spec, quote, session } = snap;
  const ccy = session.settings.accountCurrency;
  const d = spec.digits;
  const [closeDraft, setCloseDraft] = useState("");
  const [slDraft, setSlDraft] = useState<string | null>(null);
  const [tpDraft, setTpDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!pos) {
    return (
      <Modal open onClose={onClose} title="Manage position" icon={SlidersHorizontal} size="sm">
        <p className="text-sm text-muted">This position has already closed.</p>
      </Modal>
    );
  }

  const buy = pos.side === "buy";
  const exitPx = buy ? quote.bid : quote.ask;
  const pnl = snap.positionPnl[pos.id];
  const openPips = ((exitPx - pos.entryPrice) * (buy ? 1 : -1)) / spec.pipSize;

  // Part to close, in lots (0 = none). A remainder below the minimum lot closes everything.
  const typed = closeDraft.trim() === "" ? 0 : Number(closeDraft.replace(",", "."));
  const closeValid = closeDraft.trim() === "" || (Number.isFinite(typed) && typed >= 0);
  let closeLots = closeValid ? floorLots(Math.min(typed, pos.lots)) : 0;
  if (closeLots > 0 && pos.lots - closeLots < MIN_LOT - 1e-9) closeLots = pos.lots;
  const remaining = +(pos.lots - closeLots).toFixed(2);
  const closesAll = closeLots > 0 && remaining <= 0;
  const realised = pnl ? (pnl.unrealized * closeLots) / pos.lots : 0;

  const slText = slDraft ?? (pos.sl !== null ? pos.sl.toFixed(d) : "");
  const tpText = tpDraft ?? (pos.tp !== null ? pos.tp.toFixed(d) : "");
  const sl = slText.trim() === "" ? null : parsePrice(slText);
  const tp = tpText.trim() === "" ? null : parsePrice(tpText);
  const levelsChanged = (slDraft !== null && sl !== pos.sl) || (tpDraft !== null && tp !== pos.tp);
  const stat = (level: number, lots: number) => levelStats({ side: pos.side, entry: pos.entryPrice, level, lots, spec, accountCurrency: ccy, conversionRate: session.settings.conversionRate, balance: snap.balance });

  const problems: string[] = [];
  if (!closeValid) problems.push("Close size must be a number of lots.");
  if (slText.trim() !== "" && sl === null) problems.push("Stop-loss must be a price.");
  if (tpText.trim() !== "" && tp === null) problems.push("Take-profit must be a price.");
  if (!closesAll && sl !== null && (buy ? sl >= quote.bid : sl <= quote.ask)) problems.push(`Stop-loss must be ${buy ? "below" : "above"} the current price (${exitPx.toFixed(d)}).`);
  if (!closesAll && tp !== null && (buy ? tp <= quote.bid : tp >= quote.ask)) problems.push(`Take-profit must be ${buy ? "above" : "below"} the current price (${exitPx.toFixed(d)}).`);
  const nothingToDo = closeLots === 0 && !levelsChanged;

  const apply = () => {
    setError(null);
    setBusy(true);
    try {
      if (closeLots > 0) {
        const r = onSubmit({ type: "close", positionId: pos.id, lots: closesAll ? undefined : closeLots });
        if (!r.ok) return setError(r.error);
      }
      if (!closesAll && levelsChanged) {
        const r = onSubmit({ type: "modify-position", positionId: pos.id, sl, tp });
        if (!r.ok) return setError(r.error);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const levelRow = (label: string, text: string, setText: (v: string) => void, level: number | null, kind: "sl" | "tp", testId: string) => {
    const st = level !== null && remaining > 0 ? stat(level, remaining) : null;
    return (
      <div className="term-field">
        <span className="flex items-center justify-between gap-2">
          {label}
          <span className="flex items-center gap-1">
            {kind === "sl" && (
              <button type="button" className="rounded bg-surface-3 px-1.5 text-[10px] font-semibold uppercase text-foreground/80 hover:text-foreground" onClick={() => setText(pos.entryPrice.toFixed(d))} title="Move the stop to the entry price">
                Break-even
              </button>
            )}
            {text && (
              <button type="button" className="rounded px-1.5 text-[10px] font-semibold uppercase text-faint hover:text-foreground" onClick={() => setText("")}>
                Remove
              </button>
            )}
          </span>
        </span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="None" aria-label={label} data-testid={testId} inputMode="decimal" />
        <span className="text-[10.5px] tabular-nums text-muted">
          {st ? (
            <>
              {st.pips.toFixed(1)} pips ·{" "}
              <span className={st.money >= 0 ? "text-profit" : "text-loss"}>
                {money(st.money, ccy, { signed: true })} on {remaining.toFixed(2)} lots
              </span>
            </>
          ) : (
            "No level"
          )}
        </span>
      </div>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Manage position"
      subtitle={`${buy ? "Long" : "Short"} ${pos.lots.toFixed(2)} lots ${spec.symbol} · entry ${pos.entryPrice.toFixed(d)} · ${formatInTz(pos.entryT, session.displayTimezone, "short")}`}
      icon={SlidersHorizontal}
      size="md"
      footer={
        <>
          <button
            type="button"
            className="btn btn-danger mr-auto"
            onClick={() => {
              const r = onSubmit({ type: "close", positionId: pos.id });
              if (r.ok) onClose();
              else setError(r.error);
            }}
            data-testid="manage-close-all"
          >
            Close all
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={busy || nothingToDo || problems.length > 0} data-testid="manage-apply">
            {closesAll ? "Close position" : closeLots > 0 ? `Close ${closeLots.toFixed(2)} & apply` : "Apply"}
          </button>
        </>
      }
    >
      <div className="space-y-4" data-testid="position-manager">
        <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border px-3 py-2 text-center text-xs">
          <div>
            <dt className="text-muted">Price ({buy ? "bid" : "ask"})</dt>
            <dd className="font-semibold tabular-nums">{exitPx.toFixed(d)}</dd>
          </div>
          <div>
            <dt className="text-muted">Open P&amp;L</dt>
            <dd className={cn("font-semibold tabular-nums", tone(pnl?.unrealized))}>{money(pnl?.unrealized, ccy, { signed: true })}</dd>
            <dd className="tabular-nums text-faint">
              {openPips >= 0 ? "+" : "−"}
              {Math.abs(openPips).toFixed(1)} pips
            </dd>
          </div>
          <div>
            <dt className="text-muted">Open R</dt>
            <dd className={cn("font-semibold tabular-nums", tone(pnl?.openR))}>{pnl?.openR != null ? fmtR(pnl.openR) : "no stop"}</dd>
          </div>
        </dl>

        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Close part of the position</h3>
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Part to close">
            {PARTS.map((pct) => {
              const lots = pct === 100 ? pos.lots : floorLots((pos.lots * pct) / 100);
              const on = closeLots > 0 && Math.abs(closeLots - lots) < 1e-9;
              return (
                <button
                  key={pct}
                  type="button"
                  disabled={lots <= 0}
                  onClick={() => setCloseDraft(lots.toFixed(2))}
                  aria-pressed={on}
                  className={cn("h-9 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40", on ? "bg-accent text-accent-foreground" : "bg-[var(--term-chip)] text-foreground/85 hover:text-foreground")}
                  data-testid={`manage-part-${pct}`}
                >
                  {pct}%<span className="block text-[10px] font-medium opacity-75">{lots.toFixed(2)} lots</span>
                </button>
              );
            })}
          </div>
          <label className="term-field mt-2">
            <span>Lots to close (of {pos.lots.toFixed(2)})</span>
            <input value={closeDraft} onChange={(e) => setCloseDraft(e.target.value)} placeholder="0.00" inputMode="decimal" aria-label="Lots to close" data-testid="manage-close-lots" />
          </label>
          <p className="mt-1.5 text-[11.5px] text-muted" data-testid="manage-summary">
            {closeLots > 0 ? (
              <>
                Closes <strong className="text-foreground">{closeLots.toFixed(2)} lots</strong> at market (~{exitPx.toFixed(d)}), realising about{" "}
                <span className={tone(realised)}>{money(realised, ccy, { signed: true })}</span>.{" "}
                {closesAll ? "The position closes completely." : <>Remaining: <strong className="text-foreground">{remaining.toFixed(2)} lots</strong>.</>}
              </>
            ) : (
              "Nothing closed — only the levels below change."
            )}
          </p>
        </section>

        {!closesAll && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              {closeLots > 0 ? `Remaining ${remaining.toFixed(2)} lots — stop & target` : "Stop & target"}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {levelRow("Stop loss", slText, setSlDraft, sl, "sl", "manage-sl")}
              {levelRow("Take profit", tpText, setTpDraft, tp, "tp", "manage-tp")}
            </div>
          </section>
        )}

        {(problems.length > 0 || error) && (
          <ul className="space-y-0.5 text-xs text-loss" role="alert">
            {[...problems, ...(error ? [error] : [])].map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
