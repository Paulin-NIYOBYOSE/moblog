"use client";

import { useState } from "react";
import { Crosshair } from "lucide-react";
import Modal from "@/components/ui/Modal";
import type { ControllerSnapshot, NewCommand } from "@/lib/replay/controller";
import { labelOf, validatePendingPrice, validateStops, type ApplyResult } from "@/lib/replay/engine";
import { levelStats, rewardRisk, signedMoney, signedPct } from "@/lib/replay/positionMath";
import { computeSizing, floorLots } from "@/lib/replay/sizing";
import type { Drawing, PendingType } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import { projectionLevels } from "../chart/projection";

function Row({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 py-1.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className={cn("text-right tabular-nums", cls)}>
        {value}
        {sub && <span className="ml-2 text-xs text-muted">{sub}</span>}
      </span>
    </div>
  );
}

/**
 * "Place order" from a Long/Short position projection (FX Replay flow): the
 * order is pre-filled from the box — entry, stop, target and a risk-based size.
 */
export default function ProjectionOrderModal({
  snap,
  drawing,
  onClose,
  onSubmit,
}: {
  snap: ControllerSnapshot;
  drawing: Drawing;
  onClose: () => void;
  onSubmit: (cmd: NewCommand) => ApplyResult;
}) {
  const { spec, quote, session } = snap;
  const set = session.settings;
  const ccy = set.accountCurrency;
  const lv = projectionLevels(drawing);
  const buy = lv.side === "buy";
  const slip = Math.max(0, set.slippagePips) * spec.pipSize;
  const current = buy ? quote.ask : quote.bid;
  const pendingType: PendingType = buy ? (lv.entry < quote.ask ? "buy-limit" : "buy-stop") : lv.entry > quote.bid ? "sell-limit" : "sell-stop";
  const nearMarket = Math.abs(lv.entry - current) <= 2 * spec.pipSize;
  const [kind, setKind] = useState<"market" | "pending">(nearMarket ? "market" : "pending");
  const [lotsDraft, setLotsDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entry = kind === "market" ? +(buy ? quote.ask + slip : quote.bid - slip).toFixed(spec.digits) : lv.entry;
  const sizing = computeSizing({
    mode: set.riskMode,
    side: lv.side,
    equity: snap.equity,
    riskPercent: set.riskPercent,
    riskMoney: set.riskMoney,
    fixedLots: set.fixedLots,
    entry,
    sl: lv.sl,
    tp: lv.tp,
    spec,
    accountCurrency: ccy,
    conversionRate: set.conversionRate,
  });
  const lots = lotsDraft !== null ? floorLots(Number(lotsDraft)) : sizing.lots;
  const stat = (level: number) => levelStats({ side: lv.side, entry, level, lots, spec, accountCurrency: ccy, conversionRate: set.conversionRate, balance: snap.balance });
  const slS = stat(lv.sl);
  const tpS = stat(lv.tp);
  const rr = rewardRisk(entry, lv.sl, lv.tp);
  const validation =
    kind === "market"
      ? validateStops(buy, buy ? quote.bid : quote.ask, lv.sl, lv.tp, "current price")
      : (validatePendingPrice(pendingType, lv.entry, quote) ?? validateStops(buy, lv.entry, lv.sl, lv.tp, "order price"));
  const problems = [validation, ...(lotsDraft === null ? sizing.errors : []), lots <= 0 ? "Size must be at least 0.01 lots." : null].filter(Boolean) as string[];

  const place = () => {
    setError(null);
    const tf = session.timeframe;
    const r =
      kind === "market"
        ? onSubmit({ type: "market", side: lv.side, lots, sl: lv.sl, tp: lv.tp, timeframe: tf })
        : onSubmit({ type: "pending", orderType: pendingType, price: lv.entry, lots, sl: lv.sl, tp: lv.tp, timeframe: tf });
    if (r.ok) onClose();
    else setError(r.error);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Place ${buy ? "long" : "short"} order`}
      subtitle={`${spec.symbol} · from the position tool on the chart`}
      icon={Crosshair}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary ml-auto" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            onClick={place}
            disabled={problems.length > 0}
            className={cn("btn text-white disabled:opacity-45", buy ? "bg-[#089981] hover:bg-[#089981]/90" : "bg-[#f23645] hover:bg-[#f23645]/90")}
            data-testid="projection-place"
          >
            {buy ? "Buy" : "Sell"} {lots > 0 ? lots.toFixed(2) : ""} {kind === "market" ? "at market" : labelOf(pendingType).toLowerCase()}
          </button>
        </>
      }
    >
      <div className="mb-3 flex rounded-[0.7rem] border border-border bg-surface-2 p-0.5 text-xs font-medium" role="tablist" aria-label="Order type">
        {(
          [
            ["market", `Market @ ${current.toFixed(spec.digits)}`],
            ["pending", `${labelOf(pendingType)} @ ${lv.entry.toFixed(spec.digits)}`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={cn("flex-1 rounded-[0.55rem] py-1.5", kind === k ? "bg-card text-foreground shadow-sm" : "text-muted")}>
            {label}
          </button>
        ))}
      </div>
      <Row label="Entry" value={entry.toFixed(spec.digits)} sub={kind === "market" ? (buy ? "ask" : "bid") : undefined} />
      <Row label="Stop loss" value={lv.sl.toFixed(spec.digits)} sub={`${slS.pips.toFixed(1)} pips · ${signedMoney(slS.money, ccy)} (${signedPct(slS.accountPct)})`} cls="text-[#f23645]" />
      <Row label="Take profit" value={lv.tp.toFixed(spec.digits)} sub={`${tpS.pips.toFixed(1)} pips · ${signedMoney(tpS.money, ccy)} (${signedPct(tpS.accountPct)})`} cls="text-[#089981]" />
      <Row label="Reward : risk" value={rr !== null ? `${rr.toFixed(2)} : 1` : "—"} />
      <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
        <span className="text-muted">
          Size <span className="text-xs">({set.riskMode === "percent" ? `${set.riskPercent}% risk` : set.riskMode === "money" ? `${set.riskMoney} ${ccy} risk` : "fixed lots"})</span>
        </span>
        <input
          className="input !w-28 !py-1 text-right tabular-nums"
          type="number"
          min={0.01}
          step={0.01}
          value={lotsDraft ?? (sizing.lots > 0 ? sizing.lots.toFixed(2) : "")}
          onChange={(e) => setLotsDraft(e.target.value)}
          aria-label="Lots"
          data-testid="projection-lots"
        />
      </div>
      {(problems.length > 0 || error) && (
        <ul className="mt-2 space-y-0.5 text-xs text-loss" role="alert">
          {[...problems, ...(error ? [error] : [])].map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
