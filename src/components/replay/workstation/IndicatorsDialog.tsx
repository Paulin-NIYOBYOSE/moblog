"use client";

import { useState } from "react";
import { Eye, EyeOff, Plus, Search, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import type { IndicatorConfig } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import { IndicatorsIcon } from "./ChartTopBar";

export const INDICATOR_INFO: Record<IndicatorConfig["type"], { name: string; short: string; about: string; pane: "price" | "own" }> = {
  sma: { name: "Moving Average", short: "MA", about: "Simple average of the last N closes.", pane: "price" },
  ema: { name: "Moving Average Exponential", short: "EMA", about: "Average that weights recent closes more.", pane: "price" },
  bb: { name: "Bollinger Bands", short: "BB", about: "Moving average ± N standard deviations.", pane: "price" },
  rsi: { name: "Relative Strength Index", short: "RSI", about: "Momentum oscillator from 0 to 100.", pane: "own" },
  atr: { name: "Average True Range", short: "ATR", about: "Average candle range including gaps — volatility.", pane: "own" },
  macd: { name: "MACD", short: "MACD", about: "Difference of two EMAs with a signal line.", pane: "own" },
};

const DEFAULTS: Record<IndicatorConfig["type"], Omit<IndicatorConfig, "id" | "color" | "visible">> = {
  sma: { type: "sma", period: 50 },
  ema: { type: "ema", period: 20 },
  bb: { type: "bb", period: 20, param2: 2 },
  rsi: { type: "rsi", period: 14 },
  atr: { type: "atr", period: 14 },
  macd: { type: "macd", period: 12, param2: 26, param3: 9 },
};

const PALETTE = ["#2962ff", "#ff9800", "#e040fb", "#00bcd4", "#f5c451", "#4caf50", "#ff5252"];

export function indicatorTitle(i: IndicatorConfig): string {
  const info = INDICATOR_INFO[i.type];
  if (i.type === "bb") return `${info.short} ${i.period} ${i.param2 ?? 2}`;
  if (i.type === "macd") return `${info.short} ${i.period} ${i.param2 ?? 26} ${i.param3 ?? 9}`;
  return `${info.short} ${i.period}`;
}

function Param({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className="input !h-7 !w-14 !rounded-lg !px-1.5 !py-0 text-xs tabular-nums"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) onChange(step < 1 ? v : Math.round(v));
        }}
      />
    </label>
  );
}

/** TradingView-style indicator picker: search, add (several of each), edit, hide, remove. */
export default function IndicatorsDialog({ open, onClose, indicators, onChange }: { open: boolean; onClose: () => void; indicators: IndicatorConfig[]; onChange: (next: IndicatorConfig[]) => void }) {
  const [q, setQ] = useState("");
  const active = indicators.filter((i) => i.visible);
  const patch = (id: string, p: Partial<IndicatorConfig>) => onChange(indicators.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const add = (type: IndicatorConfig["type"]) => {
    const used = new Set(active.map((i) => i.color));
    const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[active.length % PALETTE.length];
    const ids = new Set(indicators.map((i) => i.id));
    let n = 1;
    while (ids.has(`${type}_${n}`)) n++;
    onChange([...indicators, { ...DEFAULTS[type], id: `${type}_${n}`, color, visible: true }]);
  };
  const types = (Object.keys(INDICATOR_INFO) as IndicatorConfig["type"][]).filter((t) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const info = INDICATOR_INFO[t];
    return info.name.toLowerCase().includes(s) || info.short.toLowerCase().includes(s);
  });

  return (
    <Modal open={open} onClose={onClose} title="Indicators" subtitle="Computed from revealed candles only — never from future data." icon={IndicatorsIcon} size="lg">
      <div className="grid gap-4 md:grid-cols-[1fr_1.15fr]">
        <div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input className="input !rounded-full !py-2 pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search indicators" autoFocus />
          </div>
          <ul className="space-y-0.5" data-testid="indicator-list">
            {types.map((t) => (
              <li key={t}>
                <button type="button" onClick={() => add(t)} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2" data-testid={`add-indicator-${t}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{INDICATOR_INFO[t].name}</span>
                    <span className="block truncate text-[11px] text-muted">{INDICATOR_INFO[t].about}</span>
                  </span>
                  <Plus className="h-4 w-4 text-faint group-hover:text-accent" />
                </button>
              </li>
            ))}
            {types.length === 0 && <li className="px-3 py-4 text-sm text-muted">No indicator matches “{q}”.</li>}
          </ul>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">On the chart ({active.length})</div>
          {active.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">Pick an indicator on the left to add it.</p>
          ) : (
            <ul className="space-y-1.5">
              {active.map((ind) => (
                <li key={ind.id} className={cn("rounded-xl border border-border px-3 py-2", ind.hidden && "opacity-60")}>
                  <div className="flex items-center gap-2">
                    <input type="color" value={ind.color} onChange={(e) => patch(ind.id, { color: e.target.value })} className="h-5 w-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={`${indicatorTitle(ind)} colour`} />
                    <span className="flex-1 text-sm font-medium">{indicatorTitle(ind)}</span>
                    <button type="button" onClick={() => patch(ind.id, { hidden: !ind.hidden })} className="rounded p-1 text-muted hover:text-foreground" aria-label={ind.hidden ? "Show" : "Hide"} title={ind.hidden ? "Show" : "Hide"}>
                      {ind.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button type="button" onClick={() => onChange(indicators.filter((i) => i.id !== ind.id))} className="rounded p-1 text-muted hover:text-loss" aria-label={`Remove ${indicatorTitle(ind)}`} title="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-3 pl-7">
                    <Param label={ind.type === "macd" ? "Fast" : "Length"} value={ind.period} min={2} max={500} onChange={(v) => patch(ind.id, { period: v })} />
                    {ind.type === "bb" && <Param label="StdDev" value={ind.param2 ?? 2} min={0.5} max={5} step={0.5} onChange={(v) => patch(ind.id, { param2: v })} />}
                    {ind.type === "macd" && (
                      <>
                        <Param label="Slow" value={ind.param2 ?? 26} min={3} max={500} onChange={(v) => v > ind.period && patch(ind.id, { param2: v })} />
                        <Param label="Signal" value={ind.param3 ?? 9} min={2} max={100} onChange={(v) => patch(ind.id, { param3: v })} />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
