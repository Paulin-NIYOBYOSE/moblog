"use client";

import { Activity } from "lucide-react";
import type { IndicatorConfig } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import Popover from "../Popover";

const LABEL: Record<IndicatorConfig["type"], string> = {
  sma: "SMA",
  ema: "EMA",
  bb: "Bollinger Bands",
  rsi: "RSI",
  atr: "ATR",
  macd: "MACD",
};

export default function IndicatorMenu({ indicators, onChange }: { indicators: IndicatorConfig[]; onChange: (next: IndicatorConfig[]) => void }) {
  const active = indicators.filter((i) => i.visible).length;
  const patch = (id: string, p: Partial<IndicatorConfig>) => onChange(indicators.map((i) => (i.id === id ? { ...i, ...p } : i)));
  return (
    <Popover
      align="right"
      className="w-80"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn("flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground", open && "bg-surface-2 text-foreground")}
          aria-label="Indicators"
          title="Indicators"
          data-testid="indicators-menu"
        >
          <Activity className="h-4 w-4" />
          <span className="hidden 2xl:inline">Indicators</span>
          {active > 0 && <span className="rounded bg-accent px-1 text-[10px] font-bold text-accent-foreground">{active}</span>}
        </button>
      )}
    >
      <div className="mb-2 text-xs font-semibold">Indicators</div>
      <p className="mb-2 text-[11px] text-muted">Computed locally from revealed candles only — never from future data.</p>
      <ul className="space-y-1.5">
        {indicators.map((ind) => (
          <li key={ind.id} className="flex items-center gap-2">
            <button type="button" role="switch" aria-checked={ind.visible} onClick={() => patch(ind.id, { visible: !ind.visible })} className="switch" data-on={ind.visible} aria-label={`Show ${LABEL[ind.type]} ${ind.period}`} />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ind.color }} />
            <span className="flex-1 text-xs font-medium">{LABEL[ind.type]}</span>
            <label className="flex items-center gap-1 text-[10.5px] text-muted">
              {ind.type === "macd" ? "fast" : "period"}
              <input
                type="number"
                min={2}
                max={500}
                className="input !w-14 !px-1.5 !py-0.5 text-xs tabular-nums"
                value={ind.period}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v >= 2 && v <= 500) patch(ind.id, { period: v });
                }}
              />
            </label>
            {ind.type === "bb" && (
              <label className="flex items-center gap-1 text-[10.5px] text-muted">
                σ
                <input
                  type="number"
                  min={0.5}
                  max={5}
                  step={0.5}
                  className="input !w-12 !px-1.5 !py-0.5 text-xs tabular-nums"
                  value={ind.param2 ?? 2}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0 && v <= 5) patch(ind.id, { param2: v });
                  }}
                />
              </label>
            )}
            {ind.type === "macd" && (
              <label className="flex items-center gap-1 text-[10.5px] text-muted">
                slow
                <input
                  type="number"
                  min={3}
                  max={500}
                  className="input !w-12 !px-1.5 !py-0.5 text-xs tabular-nums"
                  value={ind.param2 ?? 26}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (v > ind.period && v <= 500) patch(ind.id, { param2: v });
                  }}
                />
              </label>
            )}
          </li>
        ))}
      </ul>
    </Popover>
  );
}
