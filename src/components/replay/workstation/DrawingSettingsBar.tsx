"use client";

import { Copy, Lock, Trash2, Unlock } from "lucide-react";
import type { Drawing } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import { DRAW_COLORS } from "./DrawingTools";

const NAMES: Record<Drawing["kind"], string> = {
  hline: "Horizontal line",
  vline: "Vertical line",
  trend: "Trend line",
  rect: "Rectangle",
  ray: "Ray",
  long: "Long position",
  short: "Short position",
  fib: "Fibonacci",
  text: "Text",
  pricerange: "Price range",
  daterange: "Date range",
};

/** Floating style bar for the selected drawing (TradingView-like). */
export default function DrawingSettingsBar({ drawing, onChange, onDuplicate, onDelete }: { drawing: Drawing; onChange: (next: Drawing) => void; onDuplicate: () => void; onDelete: () => void }) {
  const d = drawing;
  const set = (patch: Partial<Drawing>) => onChange({ ...d, ...patch });
  const projection = d.kind === "long" || d.kind === "short";
  return (
    <div className="pointer-events-auto absolute left-1/2 top-9 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-xl border border-border bg-card/95 px-2 py-1 shadow-lg backdrop-blur" role="toolbar" aria-label="Drawing settings" data-testid="drawing-settings">
      <span className="px-1 text-[11px] font-semibold text-muted">{NAMES[d.kind]}</span>
      {!projection && (
        <>
          <div className="flex items-center" role="radiogroup" aria-label="Colour">
            {DRAW_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={d.color === c} aria-label={`Colour ${c}`} onClick={() => set({ color: c })} className={cn("m-0.5 h-4 w-4 rounded-full ring-offset-1 ring-offset-card", d.color === c && "ring-2 ring-foreground/60")} style={{ background: c }} />
            ))}
          </div>
          <select className="input !h-7 !w-auto !py-0 !pl-2 text-xs" value={d.width ?? 1} onChange={(e) => set({ width: Number(e.target.value) as 1 | 2 | 3 })} aria-label={d.kind === "text" ? "Text size" : "Line width"}>
            <option value={1}>{d.kind === "text" ? "Small" : "1 px"}</option>
            <option value={2}>{d.kind === "text" ? "Medium" : "2 px"}</option>
            <option value={3}>{d.kind === "text" ? "Large" : "3 px"}</option>
          </select>
          {d.kind !== "text" && (
            <select className="input !h-7 !w-auto !py-0 !pl-2 text-xs" value={d.style ?? "solid"} onChange={(e) => set({ style: e.target.value as Drawing["style"] })} aria-label="Line style">
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          )}
          {(d.kind === "text" || d.kind === "hline") && (
            <input
              className="input !h-7 !w-40 !py-0 text-xs"
              value={d.kind === "text" ? d.text ?? "" : d.label ?? ""}
              placeholder={d.kind === "text" ? "Text" : "Label (optional)"}
              onChange={(e) => set(d.kind === "text" ? { text: e.target.value } : { label: e.target.value || undefined })}
              aria-label={d.kind === "text" ? "Text" : "Line label"}
              autoFocus={d.kind === "text" && d.text === "Text"}
              onKeyDown={(e) => {
                // Enter/Escape finish editing (a second Escape deselects).
                if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
              }}
              data-testid="drawing-text"
            />
          )}
        </>
      )}
      <button type="button" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" onClick={() => set({ locked: !d.locked })} aria-label={d.locked ? "Unlock" : "Lock"} title={d.locked ? "Unlock (allow moving)" : "Lock (prevent moving)"} aria-pressed={Boolean(d.locked)}>
        {d.locked ? <Lock className="h-3.5 w-3.5 text-accent" /> : <Unlock className="h-3.5 w-3.5" />}
      </button>
      <button type="button" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" onClick={onDuplicate} aria-label="Duplicate" title="Duplicate">
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="rounded-md p-1.5 text-muted hover:bg-loss-soft hover:text-loss" onClick={onDelete} aria-label="Delete drawing" title="Delete (Delete key)">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
