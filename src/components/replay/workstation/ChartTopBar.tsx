"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Camera, Check, CornerUpLeft, CornerUpRight, Loader2, Maximize, Minimize, MoveRight, Plus, Search, Settings } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import type { ControllerSnapshot } from "@/lib/replay/controller";
import { availableTimeframes, DISPLAY_TIMEZONES, formatInTz, fromInputValue, toInputValue } from "@/lib/replay/time";
import type { Timeframe } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import Popover from "../Popover";

export const TF_SHORT: Record<Timeframe, string> = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "D", W1: "W" };

export function IndicatorsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M3.5 15.5c1.8 0 2.3-3 3.2-6.4C7.6 5.7 8.4 3.5 10 3.5" />
      <path d="M5 9.5h4" />
      <path d="m12 11 4 5M16 11l-4 5" />
    </svg>
  );
}

const divider = <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;
const btnBase = "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors hover:bg-surface-2 disabled:opacity-35 disabled:hover:bg-transparent";
const plainBtn = `${btnBase} text-foreground/90`;

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="switch mt-0.5 shrink-0" data-on={on} aria-label={label} />
    </label>
  );
}

/** "Go to" a replay date (forward runs every candle in between; back asks first). */
export function GoToPopover({ snap, onJump, children, align }: { snap: ControllerSnapshot; onJump: (t: number) => void; children: (open: () => void) => ReactNode; align?: "left" | "right" }) {
  const { session } = snap;
  const tz = session.displayTimezone;
  const [jumpValue, setJumpValue] = useState("");
  return (
    <Popover
      align={align}
      trigger={({ toggle }) =>
        children(() => {
          setJumpValue(toInputValue(snap.nowT, tz));
          toggle();
        })
      }
      className="w-72"
    >
      {(close) => (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Go to</div>
          <input type="datetime-local" className="input !py-1.5" value={jumpValue} min={toInputValue(session.startT, tz)} max={toInputValue(session.endT, tz)} onChange={(e) => setJumpValue(e.target.value)} aria-label="Replay date and time" />
          <p className="text-[11px] text-muted">
            Times in {DISPLAY_TIMEZONES.find((z) => z.value === tz)?.label ?? tz}. Going forward processes every candle in between, so orders can fill. Going back undoes later actions (you’ll be asked first).
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn btn-secondary btn-sm flex-1"
              onClick={() => {
                onJump(session.startT);
                close();
              }}
            >
              Session start
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm flex-1"
              onClick={() => {
                const t = fromInputValue(jumpValue, tz);
                if (t !== null) onJump(t);
                close();
              }}
            >
              Go
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

export default function ChartTopBar({
  snap,
  center,
  onTimeframe,
  onIndicators,
  activeIndicators,
  onPlaceOrder,
  onJump,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onTimezone,
  shading,
  onShading,
  autoScroll,
  onAutoScroll,
  pastTrades,
  onPastTrades,
  tradeLabels,
  onTradeLabels,
  fullscreen,
  onFullscreen,
  onScreenshot,
}: {
  snap: ControllerSnapshot;
  center?: ReactNode;
  onTimeframe: (tf: Timeframe) => void;
  onIndicators: () => void;
  activeIndicators: number;
  onPlaceOrder: () => void;
  onJump: (t: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onTimezone: (tz: string) => void;
  shading: boolean;
  onShading: (v: boolean) => void;
  autoScroll: boolean;
  onAutoScroll: (v: boolean) => void;
  pastTrades: boolean;
  onPastTrades: (v: boolean) => void;
  tradeLabels: boolean;
  onTradeLabels: (v: boolean) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  onScreenshot: () => void;
}) {
  const { session, dataset, spec } = snap;
  const tz = session.displayTimezone;
  const tfs = availableTimeframes(dataset.timeframe);
  const saveLabel = snap.saveState === "saved" ? "Saved" : snap.saveState === "saving" ? "Saving…" : snap.saveState === "error" ? "Not saved" : "Save";

  return (
    <div className="@container relative flex h-12 shrink-0 items-center gap-0.5 border-b border-border px-2" role="toolbar" aria-label="Chart toolbar">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar">
        <Popover
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className={cn(plainBtn, "font-semibold")} title="Instrument" data-testid="symbol-info">
              <Search className="h-4 w-4 text-muted" /> {spec.symbol}
            </button>
          )}
          className="w-72"
        >
          <div className="space-y-1.5 text-sm">
            <div className="text-base font-semibold">{spec.symbol}</div>
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-muted">Data</dt>
              <dd className="text-right">{dataset.provider ? "FXCM historical candles" : dataset.name}</dd>
              <dt className="text-muted">Resolution</dt>
              <dd className="text-right">{dataset.timeframe}</dd>
              <dt className="text-muted">Prices</dt>
              <dd className="text-right capitalize">{dataset.priceBasis === "unknown" ? "Basis unknown" : dataset.priceBasis}</dd>
              <dt className="text-muted">Pip size</dt>
              <dd className="text-right tabular-nums">{spec.pipSize}</dd>
              <dt className="text-muted">Session range</dt>
              <dd className="text-right">
                {formatInTz(session.startT, tz, "tick-day")} → {formatInTz(session.endT, tz, "tick-day")}
              </dd>
            </dl>
            <p className="text-[11px] text-muted">A session replays one instrument. Start another session for a different market.</p>
          </div>
        </Popover>
        {divider}
        <div className="flex items-center" role="tablist" aria-label="Timeframe">
          {tfs.map((tf) => (
            <button
              key={tf}
              type="button"
              role="tab"
              aria-selected={session.timeframe === tf}
              onClick={() => onTimeframe(tf)}
              title={tf}
              className={cn("h-8 min-w-[2rem] shrink-0 rounded-lg px-1.5 text-[13px] font-medium transition-colors hover:bg-surface-2", session.timeframe === tf ? "text-accent" : "text-foreground/80")}
            >
              {TF_SHORT[tf]}
            </button>
          ))}
        </div>
        {divider}
        <button type="button" onClick={onIndicators} className={plainBtn} data-testid="indicators-menu" title="Indicators">
          <IndicatorsIcon className="h-[18px] w-[18px]" />
          <span className="hidden md:inline">Indicators</span>
          {activeIndicators > 0 && <span className="rounded-md bg-surface-3 px-1 text-[10px] font-bold tabular-nums">{activeIndicators}</span>}
        </button>
        {divider}
        <button type="button" onClick={onPlaceOrder} className={cn(btnBase, "font-semibold text-accent")} data-testid="open-order-panel" disabled={snap.atEnd}>
          <Plus className="h-4 w-4" /> Place Order
        </button>
        <GoToPopover snap={snap} onJump={onJump}>
          {(open) => (
            <button type="button" onClick={open} className={plainBtn} title="Go to a date" data-testid="go-to">
              <MoveRight className="h-4 w-4" /> Go to
            </button>
          )}
        </GoToPopover>
        {divider}
        <button type="button" onClick={onUndo} disabled={!canUndo} className={cn(plainBtn, "px-1.5")} title="Undo drawing change (Ctrl/⌘+Z)" aria-label="Undo" data-testid="drawing-undo">
          <CornerUpLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} className={cn(plainBtn, "px-1.5")} title="Redo drawing change (Ctrl/⌘+Shift+Z)" aria-label="Redo" data-testid="drawing-redo">
          <CornerUpRight className="h-4 w-4" />
        </button>
      </div>

      {center}

      <div className="flex shrink-0 items-center gap-0.5 pl-1">
        <button
          type="button"
          onClick={onSave}
          className={cn("flex h-9 flex-col items-center justify-center rounded-lg px-2.5 leading-none hover:bg-surface-2", snap.saveState === "error" ? "text-loss" : "text-foreground")}
          title={snap.saveError ?? "Sessions save automatically to the database. Click to save now."}
          data-testid="replay-save"
        >
          <span className="flex items-center gap-1 text-[13px] font-medium">
            {snap.saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : snap.saveState === "error" ? <AlertTriangle className="h-3 w-3" /> : snap.saveState === "saved" ? <Check className="h-3 w-3 text-profit" /> : null}
            {saveLabel}
          </span>
          <span className="mt-0.5 hidden text-[9.5px] text-accent sm:block">{snap.saveState === "dirty" ? "Unsaved changes" : "Autosave"}</span>
        </button>
        <Popover
          align="right"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className={cn(plainBtn, "px-1.5")} title="Chart settings" aria-label="Chart settings" data-testid="chart-settings">
              <Settings className="h-[18px] w-[18px]" />
            </button>
          )}
          className="w-72 !p-1.5"
        >
          <div className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">Chart settings</div>
          <Toggle label="Session shading" hint="Tint the Asia, London and New York sessions" on={shading} onChange={onShading} />
          <Toggle label="Auto-scroll" hint="Keep the newest candle in view while stepping" on={autoScroll} onChange={onAutoScroll} />
          <Toggle label="Past trades on chart" hint="Zones and entry/exit markers of closed trades (off: a closed trade leaves the chart clean)" on={pastTrades} onChange={onPastTrades} />
          {pastTrades && <Toggle label="Trade marker labels" hint="Text such as “Buy 0.50” and “TP +2.0R” on the markers" on={tradeLabels} onChange={onTradeLabels} />}
          <label className="block rounded-lg px-2 py-1.5">
            <span className="mb-1 block text-sm">Time zone</span>
            <select className="input !py-1.5 text-sm" value={tz} onChange={(e) => onTimezone(e.target.value)} aria-label="Display time zone">
              {DISPLAY_TIMEZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
            <span className="text-sm">Theme</span>
            <ThemeToggle />
          </div>
        </Popover>
        <button type="button" onClick={onFullscreen} className={cn(plainBtn, "hidden px-1.5 md:flex")} title={fullscreen ? "Exit full screen" : "Full screen"} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
          {fullscreen ? <Minimize className="h-[18px] w-[18px]" /> : <Maximize className="h-[18px] w-[18px]" />}
        </button>
        <button type="button" onClick={onScreenshot} className={cn(plainBtn, "px-1.5")} title="Download a chart screenshot" aria-label="Download a chart screenshot">
          <Camera className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}

