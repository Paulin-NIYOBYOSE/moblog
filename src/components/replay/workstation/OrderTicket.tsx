"use client";

import { Crosshair, Info, Loader2, X } from "lucide-react";
import type { ControllerSnapshot } from "@/lib/replay/controller";
import { formatPrice } from "@/lib/replay/instruments";
import type { RiskMode } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPct, money, tone } from "../format";
import type { PickTarget } from "../chart/ReplayChart";
import type { DerivedTicket, LevelMode, TicketState } from "./ticket";

function Hint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-3 w-3 text-faint" aria-hidden />
      <span className="sr-only">{text}</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-56 -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug tracking-normal text-foreground shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

export function AccountStrip({ snap }: { snap: ControllerSnapshot }) {
  const ccy = snap.session.settings.accountCurrency;
  const pctOf = (v: number) => (snap.balance > 0 ? (v / snap.balance) * 100 : null);
  const rows: { label: string; value: string; cls?: string; hint: string }[] = [
    {
      label: "Balance",
      value: `${money(snap.balance, ccy)} · ${fmtPct(((snap.balance - snap.session.settings.initialBalance) / snap.session.settings.initialBalance) * 100, 2, true)}`,
      hint: "Starting balance plus realised P&L of closed trades and partial closes; % return on the starting balance.",
    },
    { label: "Equity", value: money(snap.equity, ccy), hint: "Balance plus the unrealised P&L of open positions at the current price." },
    {
      label: "Open P&L",
      value: `${money(snap.unrealized, ccy, { signed: true })} · ${fmtPct(pctOf(snap.unrealized), 2, true)}`,
      cls: tone(snap.unrealized),
      hint: "Unrealised P&L of open positions, after entry commission, and as a % of balance.",
    },
    {
      label: "Today",
      value: `${money(snap.dailyPnl, ccy, { signed: true })} · ${fmtPct(pctOf(snap.dailyPnl), 2, true)}`,
      cls: tone(snap.dailyPnl),
      hint: "Realised P&L in the current replay trading day (rolls at the configured day boundary), and as a % of balance.",
    },
    {
      label: "Open risk",
      value: snap.unprotected ? `${money(snap.openRisk, ccy)} +${snap.unprotected} no SL` : money(snap.openRisk, ccy),
      cls: snap.unprotected ? "text-warning" : undefined,
      hint: "Money lost if every open position hit its current stop-loss. Positions without a stop are counted separately.",
    },
    {
      label: "Max DD",
      value: `${money(snap.maxDrawdown, ccy)} · ${fmtPct(snap.maxDrawdownPct)}`,
      hint: "Largest peak-to-trough fall of equity, marked to market at each candle close in this session.",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
      {rows.map((r) => (
        <div key={r.label} className="bg-card px-2.5 py-2">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {r.label} <Hint text={r.hint} />
          </div>
          <div className={cn("mt-0.5 truncate text-[0.82rem] font-semibold tabular-nums", r.cls)}>{r.value}</div>
        </div>
      ))}
    </div>
  );
}

function LevelInput({
  label,
  mode,
  value,
  price,
  digits,
  onMode,
  onValue,
  onPick,
  picking,
  testId,
}: {
  label: string;
  mode: LevelMode;
  value: string;
  price: number | null;
  digits: number;
  onMode: (m: LevelMode) => void;
  onValue: (v: string) => void;
  onPick: () => void;
  picking: boolean;
  testId: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <div className="flex rounded-md border border-border bg-surface-2 p-px text-[10px] font-semibold">
          {(["pips", "price"] as LevelMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              className={cn("rounded px-1.5 py-0.5", mode === m ? "bg-card text-foreground shadow-sm" : "text-muted")}
              aria-pressed={mode === m}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1">
        <div className="relative flex-1">
          <input
            className="input !py-1.5 pr-7 tabular-nums"
            inputMode="decimal"
            value={value}
            onChange={(e) => onValue(e.target.value)}
            placeholder={mode === "pips" ? "pips" : "price"}
            aria-label={`${label} (${mode})`}
            data-testid={testId}
          />
          {value && (
            <button type="button" onClick={() => onValue("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-faint hover:text-foreground" aria-label={`Clear ${label}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onPick}
          className={cn("btn btn-secondary btn-icon btn-sm !h-auto", picking && "!border-accent !text-accent")}
          title={`Pick ${label.toLowerCase()} on the chart`}
          aria-label={`Pick ${label.toLowerCase()} on the chart`}
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-0.5 h-4 text-[10.5px] tabular-nums text-faint">{price !== null ? `@ ${price.toFixed(digits)}` : mode === "pips" && value ? "" : "none"}</div>
    </div>
  );
}

export default function OrderTicket({
  snap,
  ticket,
  derived,
  onChange,
  onSubmit,
  submitting,
  pick,
  onPick,
  onRiskChange,
}: {
  snap: ControllerSnapshot;
  ticket: TicketState;
  derived: DerivedTicket;
  onChange: (t: TicketState) => void;
  onSubmit: () => void;
  submitting: boolean;
  pick: PickTarget | null;
  onPick: (t: PickTarget | null) => void;
  onRiskChange: (patch: { riskMode?: RiskMode; riskPercent?: number; riskMoney?: number; fixedLots?: number }) => void;
}) {
  const { spec, quote, session } = snap;
  const s = session.settings;
  const ccy = s.accountCurrency;
  const sz = derived.sizing;
  const set = (patch: Partial<TicketState>) => onChange({ ...ticket, ...patch });
  const buy = ticket.side === "buy";
  const disabled = snap.atEnd || submitting || derived.errors.length > 0 || sz.lots <= 0;
  const riskValue = s.riskMode === "percent" ? s.riskPercent : s.riskMode === "money" ? s.riskMoney : s.fixedLots;

  return (
    <div className="space-y-3">
      {/* Side */}
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Direction">
        {(["sell", "buy"] as const).map((side) => {
          const active = ticket.side === side;
          const px = side === "buy" ? quote.ask : quote.bid;
          return (
            <button
              key={side}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => set({ side })}
              data-testid={`side-${side}`}
              className={cn(
                "rounded-xl border px-2 py-2 text-left transition-colors",
                active
                  ? side === "buy"
                    ? "border-profit/60 bg-profit-soft"
                    : "border-loss/60 bg-loss-soft"
                  : "border-border bg-surface hover:border-border-strong dark:bg-surface-2",
              )}
            >
              <div className={cn("text-[11px] font-bold uppercase tracking-wider", side === "buy" ? "text-profit" : "text-loss")}>
                {side === "buy" ? "▲ Buy" : "▼ Sell"}
              </div>
              <div className="text-[0.95rem] font-semibold tabular-nums">{formatPrice(px, spec)}</div>
              <div className="text-[10px] text-faint">{side === "buy" ? "ask" : "bid"}</div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10.5px] text-muted">
        <span>Spread {(quote.spread / spec.pipSize).toFixed(1)} pips</span>
        <span>{s.spreadMode === "recorded" && snap.dataset.hasSpread ? "recorded spread" : "fixed spread"}</span>
      </div>

      {/* Order type */}
      <div className="flex rounded-[0.7rem] border border-border bg-surface-2 p-0.5" role="tablist" aria-label="Order type">
        {(["market", "limit", "stop"] as const).map((o) => (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={ticket.orderType === o}
            onClick={() => set({ orderType: o, entry: o !== "market" && !ticket.entry ? formatPrice(buy ? quote.ask : quote.bid, spec) : ticket.entry })}
            className={cn(
              "flex-1 rounded-[0.55rem] py-1 text-xs font-medium capitalize transition-colors",
              ticket.orderType === o ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {o}
          </button>
        ))}
      </div>

      {ticket.orderType !== "market" && (
        <div>
          <span className="mb-1 block text-xs font-medium text-muted">
            {buy ? "Buy" : "Sell"} {ticket.orderType} price
          </span>
          <div className="flex gap-1">
            <input
              className="input !py-1.5 tabular-nums"
              inputMode="decimal"
              value={ticket.entry}
              onChange={(e) => set({ entry: e.target.value })}
              aria-label="Order price"
              data-testid="ticket-entry"
            />
            <button
              type="button"
              onClick={() => onPick(pick === "entry" ? null : "entry")}
              className={cn("btn btn-secondary btn-icon btn-sm !h-auto", pick === "entry" && "!border-accent !text-accent")}
              title="Pick order price on the chart"
              aria-label="Pick order price on the chart"
            >
              <Crosshair className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-[10.5px] text-faint">
            {buy
              ? ticket.orderType === "limit"
                ? "Fills when the ask trades at or below this price."
                : "Fills when the ask trades at or above this price."
              : ticket.orderType === "limit"
                ? "Fills when the bid trades at or above this price."
                : "Fills when the bid trades at or below this price."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <LevelInput
          label="Stop-loss"
          mode={ticket.slMode}
          value={ticket.sl}
          price={derived.sl}
          digits={spec.digits}
          onMode={(m) => set({ slMode: m, sl: m === "price" && derived.sl !== null ? derived.sl.toFixed(spec.digits) : m === "pips" && sz.slPips !== null ? sz.slPips.toFixed(1) : ticket.sl })}
          onValue={(v) => set({ sl: v })}
          onPick={() => onPick(pick === "sl" ? null : "sl")}
          picking={pick === "sl"}
          testId="ticket-sl"
        />
        <LevelInput
          label="Take-profit"
          mode={ticket.tpMode}
          value={ticket.tp}
          price={derived.tp}
          digits={spec.digits}
          onMode={(m) => set({ tpMode: m, tp: m === "price" && derived.tp !== null ? derived.tp.toFixed(spec.digits) : m === "pips" && sz.tpPips !== null ? sz.tpPips.toFixed(1) : ticket.tp })}
          onValue={(v) => set({ tp: v })}
          onPick={() => onPick(pick === "tp" ? null : "tp")}
          picking={pick === "tp"}
          testId="ticket-tp"
        />
      </div>

      {/* Sizing */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Position size</span>
          <div className="flex rounded-md border border-border bg-surface-2 p-px text-[10px] font-semibold">
            {(
              [
                ["percent", "% equity"],
                ["money", ccy],
                ["lots", "lots"],
              ] as [RiskMode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => onRiskChange({ riskMode: m })}
                className={cn("rounded px-1.5 py-0.5", s.riskMode === m ? "bg-card text-foreground shadow-sm" : "text-muted")}
                aria-pressed={s.riskMode === m}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <input
          className="input !py-1.5 tabular-nums"
          type="number"
          min={0}
          step={s.riskMode === "lots" ? 0.01 : s.riskMode === "percent" ? 0.1 : 10}
          value={Number.isFinite(riskValue) ? riskValue : ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v) || v < 0) return;
            if (s.riskMode === "percent") onRiskChange({ riskPercent: v });
            else if (s.riskMode === "money") onRiskChange({ riskMoney: v });
            else onRiskChange({ fixedLots: v });
          }}
          aria-label={s.riskMode === "percent" ? "Risk percent of equity" : s.riskMode === "money" ? `Risk amount in ${ccy}` : "Lots"}
          data-testid="ticket-risk"
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-[11.5px]">
        <dt className="text-muted">Size</dt>
        <dd className="text-right font-semibold tabular-nums" data-testid="ticket-lots">
          {sz.lots > 0 ? `${sz.lots.toFixed(2)} lots` : "—"}
        </dd>
        <dt className="text-muted">Risk</dt>
        <dd className="text-right tabular-nums text-loss">
          {sz.riskMoney !== null ? `${money(sz.riskMoney, ccy)} · ${fmtPct(sz.riskPercent, 2)}` : "—"}
        </dd>
        <dt className="text-muted">Reward</dt>
        <dd className="text-right tabular-nums text-profit">
          {sz.rewardMoney !== null ? `${money(sz.rewardMoney, ccy)} · ${fmtPct(snap.equity > 0 ? (sz.rewardMoney / snap.equity) * 100 : null, 2)}` : "—"}
        </dd>
        <dt className="text-muted">Reward : risk</dt>
        <dd className="text-right font-semibold tabular-nums">{sz.rr !== null ? `${fmtNum(sz.rr, 2)} : 1` : "—"}</dd>
        <dt className="text-muted">SL / TP distance</dt>
        <dd className="text-right tabular-nums">
          {fmtNum(sz.slPips, 1)} / {fmtNum(sz.tpPips, 1)} pips
        </dd>
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

      <textarea
        className="input min-h-[44px] resize-y !py-1.5 text-[0.8rem]"
        placeholder="Pre-trade note (optional) — why this trade?"
        value={ticket.note}
        onChange={(e) => set({ note: e.target.value })}
        aria-label="Pre-trade note"
      />

      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        data-testid="ticket-submit"
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white shadow-md transition-opacity disabled:cursor-not-allowed disabled:opacity-45",
          buy ? "bg-profit" : "bg-loss",
        )}
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {buy ? "Buy" : "Sell"} {sz.lots > 0 ? sz.lots.toFixed(2) : ""} {spec.symbol}{" "}
        {ticket.orderType === "market" ? "at market" : `${ticket.orderType} @ ${derived.entry?.toFixed(spec.digits) ?? "…"}`}
      </button>
      {snap.atEnd && <p className="text-center text-[11px] text-muted">Replay reached the end of the session range.</p>}
      <p className="text-[10.5px] leading-snug text-faint">
        Market orders fill at the close of the last revealed candle ± spread
        {s.slippagePips > 0 ? ` and ${s.slippagePips} pip slippage` : ""}. Commission {money(s.commissionPerLot, ccy)}/lot round turn.
      </p>
    </div>
  );
}
