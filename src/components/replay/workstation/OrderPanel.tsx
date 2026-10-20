"use client";

import { useState } from "react";
import { Crosshair, Loader2, NotebookPen, X } from "lucide-react";
import type { ControllerSnapshot } from "@/lib/replay/controller";
import { formatPrice } from "@/lib/replay/instruments";
import type { RiskMode } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPct, money } from "../format";
import type { PickTarget } from "../chart/ReplayChart";
import { riskBase, type DerivedTicket, type LevelMode, type TicketState } from "./ticket";

const RISK_CHIPS = [0.3, 0.5, 0.7, 1, 2, 3];

type RiskPatch = { riskMode?: RiskMode; riskPercent?: number; riskMoney?: number; fixedLots?: number; riskBase?: "initial" | "balance" };

/** Number field that keeps what you type while focused and shows the live value otherwise. */
function NumberInput({ value, onValue, digits, ...rest }: { value: number | null; onValue: (v: number) => void; digits: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      inputMode="decimal"
      value={draft ?? (value === null || !Number.isFinite(value) ? "" : String(+value.toFixed(digits)))}
      onFocus={(e) => {
        setDraft(e.target.value);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setDraft(null);
        rest.onBlur?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = Number(e.target.value.replace(",", "."));
        if (e.target.value.trim() !== "" && Number.isFinite(v) && v >= 0) onValue(v);
      }}
    />
  );
}

function PickButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-md p-1", active ? "text-accent" : "text-faint hover:text-foreground")} title={`Pick ${label} on the chart`} aria-label={`Pick ${label} on the chart`} aria-pressed={active}>
      <Crosshair className="h-3.5 w-3.5" />
    </button>
  );
}

function LevelField({
  label,
  mode,
  value,
  price,
  pips,
  moneyAt,
  onMode,
  onValue,
  picking,
  onPick,
  testId,
  digits,
  tone,
}: {
  label: string;
  mode: LevelMode;
  value: string;
  price: number | null;
  pips: number | null;
  moneyAt: string | null;
  onMode: (m: LevelMode) => void;
  onValue: (v: string) => void;
  picking: boolean;
  onPick: () => void;
  testId: string;
  digits: number;
  tone: "profit" | "loss";
}) {
  return (
    <div className="term-field">
      <span className="flex items-center justify-between gap-1">
        <span className="whitespace-nowrap">{label}</span>
        <span className="flex items-center">
          <button
            type="button"
            onClick={() => onMode(mode === "price" ? "pips" : "price")}
            className="rounded bg-surface-3 px-1 text-[9.5px] font-semibold uppercase text-foreground/80 hover:text-foreground"
            title={`Entered in ${mode} — click to switch to ${mode === "price" ? "pips" : "price"}`}
            aria-label={`${label} unit: ${mode}. Switch to ${mode === "price" ? "pips" : "price"}`}
          >
            {mode}
          </button>
          <PickButton active={picking} label={label.toLowerCase()} onClick={onPick} />
        </span>
      </span>
      <div className="flex items-center gap-1">
        <input value={value} onChange={(e) => onValue(e.target.value)} placeholder={mode === "pips" ? "pips" : "price"} aria-label={`${label} (${mode})`} data-testid={testId} />
        {value && (
          <button type="button" onClick={() => onValue("")} className="text-faint hover:text-foreground" aria-label={`Clear ${label}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <span className="truncate text-[10.5px] tabular-nums text-muted">
        {price === null ? "None" : mode === "pips" ? `@ ${price.toFixed(digits)}` : `${fmtNum(pips, 1)} pips`}
        {moneyAt && <span className={cn("ml-1", tone === "profit" ? "text-profit" : "text-loss")}>{moneyAt}</span>}
      </span>
    </div>
  );
}

/** "New order" panel (prop-firm terminal style). */
export default function OrderPanel({
  snap,
  ticket,
  derived,
  onChange,
  onSubmit,
  onClose,
  submitting,
  pick,
  onPick,
  onRiskChange,
  fromDrawing,
}: {
  snap: ControllerSnapshot;
  ticket: TicketState;
  derived: DerivedTicket;
  onChange: (t: TicketState) => void;
  onSubmit: () => void;
  onClose: () => void;
  submitting: boolean;
  pick: PickTarget | null;
  onPick: (t: PickTarget | null) => void;
  onRiskChange: (patch: RiskPatch) => void;
  /** Set while the ticket was filled from a position drawing. */
  fromDrawing: boolean;
}) {
  const { spec, quote, session } = snap;
  const s = session.settings;
  const ccy = s.accountCurrency;
  const sz = derived.sizing;
  const base = riskBase(snap);
  const set = (patch: Partial<TicketState>) => onChange({ ...ticket, ...patch });
  const buy = ticket.side === "buy";
  const disabled = snap.atEnd || submitting || derived.errors.length > 0 || sz.lots <= 0;
  const [noteOpen, setNoteOpen] = useState(Boolean(ticket.note));
  const riskPct = s.riskMode === "percent" ? s.riskPercent : s.riskMode === "money" ? (base > 0 ? (s.riskMoney / base) * 100 : null) : sz.riskPercent;
  const riskAmt = s.riskMode === "money" ? s.riskMoney : s.riskMode === "percent" ? (base * s.riskPercent) / 100 : sz.riskMoney;
  const levelMode = (field: "sl" | "tp", m: LevelMode) => {
    const price = field === "sl" ? derived.sl : derived.tp;
    const pips = field === "sl" ? sz.slPips : sz.tpPips;
    const v = m === "price" && price !== null ? price.toFixed(spec.digits) : m === "pips" && pips !== null ? pips.toFixed(1) : ticket[field];
    set(field === "sl" ? { slMode: m, sl: v } : { tpMode: m, tp: v });
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="order-panel">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-[1.15rem] font-bold tracking-tight">New order</h2>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close order panel" data-testid="close-order-panel">
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-3">
        {fromDrawing && <p className="rounded-xl bg-accent-soft px-3 py-2 text-[11.5px] text-foreground/90">Filled from your position drawing. Drag its lines on the chart or edit the fields below.</p>}

        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Risk based on">
          {(
            [
              ["initial", "Initial balance"],
              ["balance", "Current balance"],
            ] as const
          ).map(([v, label]) => {
            const on = (s.riskBase ?? "balance") === v;
            return (
              <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onRiskChange({ riskBase: v })} className={cn("h-10 rounded-xl text-[13px] font-semibold transition-colors", on ? "bg-accent text-accent-foreground" : "bg-[var(--term-chip)] text-foreground/85 hover:text-foreground")}>
                {label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-6 gap-1" role="group" aria-label="Risk per trade">
          {RISK_CHIPS.map((r) => {
            const on = s.riskMode === "percent" && Math.abs(s.riskPercent - r) < 1e-9;
            return (
              <button key={r} type="button" onClick={() => onRiskChange({ riskMode: "percent", riskPercent: r })} aria-pressed={on} className={cn("h-8 rounded-lg text-xs font-semibold transition-colors", on ? "bg-accent text-accent-foreground" : "bg-[var(--term-chip)] text-foreground/80 hover:text-foreground")}>
                {r}%
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="term-field">
            <span>Risk %</span>
            <NumberInput value={riskPct} digits={2} onValue={(v) => onRiskChange({ riskMode: "percent", riskPercent: v })} aria-label="Risk percent" data-testid="ticket-risk" />
          </label>
          <label className="term-field">
            <span>Risk amount ({ccy})</span>
            <NumberInput value={riskAmt} digits={2} onValue={(v) => onRiskChange({ riskMode: "money", riskMoney: v })} aria-label={`Risk amount in ${ccy}`} data-testid="ticket-risk-money" />
          </label>
        </div>

        <label className="term-field">
          <span>Order type</span>
          <select
            value={ticket.orderType}
            onChange={(e) => {
              const o = e.target.value as TicketState["orderType"];
              set({ orderType: o, entry: o !== "market" && !ticket.entry ? formatPrice(buy ? quote.ask : quote.bid, spec) : ticket.entry });
            }}
            aria-label="Order type"
            data-testid="ticket-type"
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="stop">Stop</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="term-field">
            <span>Size (lots)</span>
            <NumberInput value={sz.lots > 0 ? sz.lots : null} digits={2} onValue={(v) => onRiskChange({ riskMode: "lots", fixedLots: v })} aria-label="Size in lots" data-testid="ticket-lots" />
          </label>
          <div className="grid grid-cols-2 gap-1 rounded-[0.85rem] bg-[var(--term-chip)] p-1" role="radiogroup" aria-label="Direction">
            {(["buy", "sell"] as const).map((side) => {
              const on = ticket.side === side;
              return (
                <button
                  key={side}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ side })}
                  data-testid={`side-${side}`}
                  className={cn("rounded-[0.65rem] text-[13px] font-semibold capitalize transition-colors", on ? (side === "buy" ? "bg-profit text-white" : "bg-loss text-white") : "text-foreground/80 hover:text-foreground")}
                >
                  {side}
                </button>
              );
            })}
          </div>
        </div>

        <div className="term-field">
          <span className="flex items-center justify-between">
            {ticket.orderType === "market" ? "Entry price (market)" : `Entry price (${buy ? "buy" : "sell"} ${ticket.orderType})`}
            {ticket.orderType !== "market" && <PickButton active={pick === "entry"} label="entry price" onClick={() => onPick(pick === "entry" ? null : "entry")} />}
          </span>
          {ticket.orderType === "market" ? (
            <input value={formatPrice(buy ? quote.ask : quote.bid, spec)} readOnly aria-label="Market price" className="text-muted" />
          ) : (
            <input value={ticket.entry} onChange={(e) => set({ entry: e.target.value })} aria-label="Order price" data-testid="ticket-entry" />
          )}
          <span className="text-[10.5px] tabular-nums text-muted">
            Bid {formatPrice(quote.bid, spec)} · Ask {formatPrice(quote.ask, spec)} · Spread {(quote.spread / spec.pipSize).toFixed(1)} pips
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <LevelField
            label="Stop loss"
            mode={ticket.slMode}
            value={ticket.sl}
            price={derived.sl}
            pips={sz.slPips}
            moneyAt={sz.riskMoney !== null ? `−${money(sz.riskMoney, ccy)}` : null}
            onMode={(m) => levelMode("sl", m)}
            onValue={(v) => set({ sl: v })}
            picking={pick === "sl"}
            onPick={() => onPick(pick === "sl" ? null : "sl")}
            testId="ticket-sl"
            digits={spec.digits}
            tone="loss"
          />
          <LevelField
            label="Take profit"
            mode={ticket.tpMode}
            value={ticket.tp}
            price={derived.tp}
            pips={sz.tpPips}
            moneyAt={sz.rewardMoney !== null ? `+${money(sz.rewardMoney, ccy)}` : null}
            onMode={(m) => levelMode("tp", m)}
            onValue={(v) => set({ tp: v })}
            picking={pick === "tp"}
            onPick={() => onPick(pick === "tp" ? null : "tp")}
            testId="ticket-tp"
            digits={spec.digits}
            tone="profit"
          />
        </div>

        <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border px-3 py-2 text-center text-[11px]">
          <div>
            <dt className="text-muted">Risk</dt>
            <dd className="font-semibold tabular-nums text-loss">{sz.riskMoney !== null ? money(sz.riskMoney, ccy) : "—"}</dd>
            <dd className="tabular-nums text-faint">{fmtPct(sz.riskPercent, 2)}</dd>
          </div>
          <div>
            <dt className="text-muted">Reward</dt>
            <dd className="font-semibold tabular-nums text-profit">{sz.rewardMoney !== null ? money(sz.rewardMoney, ccy) : "—"}</dd>
            <dd className="tabular-nums text-faint">{sz.rewardMoney !== null && base > 0 ? fmtPct((sz.rewardMoney / base) * 100, 2) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">R:R</dt>
            <dd className="font-semibold tabular-nums">{sz.rr !== null ? fmtNum(sz.rr, 2) : "—"}</dd>
            <dd className="tabular-nums text-faint">{sz.lots > 0 ? `${sz.lots.toFixed(2)} lots` : "—"}</dd>
          </div>
        </dl>

        {sz.warnings.map((w) => (
          <p key={w} className="text-[11px] text-warning">
            {w}
          </p>
        ))}
        {derived.errors.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-loss" role="alert">
            {derived.errors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}

        {noteOpen ? (
          <textarea className="input min-h-[52px] resize-y !rounded-xl !py-1.5 text-[0.8rem]" placeholder="Why this trade? (saved to the journal)" value={ticket.note} onChange={(e) => set({ note: e.target.value })} aria-label="Pre-trade note" autoFocus />
        ) : (
          <button type="button" onClick={() => setNoteOpen(true)} className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground">
            <NotebookPen className="h-3.5 w-3.5" /> Add a pre-trade note
          </button>
        )}
        <p className="text-[10.5px] leading-snug text-faint">
          Market orders fill at the close of the last revealed candle ± spread{s.slippagePips > 0 ? ` and ${s.slippagePips} pip slippage` : ""}. Commission {money(s.commissionPerLot, ccy)}/lot round turn.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-semibold text-foreground/85 hover:bg-surface-2">
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          data-testid="ticket-submit"
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-45"
          title={`${buy ? "Buy" : "Sell"} ${sz.lots > 0 ? sz.lots.toFixed(2) : ""} ${spec.symbol} ${ticket.orderType === "market" ? "at market" : `${ticket.orderType} @ ${derived.entry?.toFixed(spec.digits) ?? "…"}`}`}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Place order
        </button>
      </div>
    </div>
  );
}
