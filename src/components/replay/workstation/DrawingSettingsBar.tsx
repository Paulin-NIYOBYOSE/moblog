"use client";

import { useState } from "react";
import { Copy, Lock, LockOpen, MoreHorizontal, Send, Settings, Trash2 } from "lucide-react";
import type { Drawing } from "@/lib/replay/types";
import { cn } from "@/lib/utils";
import Popover from "../Popover";
import { DRAWING_NAMES } from "./DrawingTools";
import { DRAW_COLORS, TextIcon } from "./toolIcons";

const barBase = "flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5";
const barBtn = `${barBase} text-foreground/80 hover:bg-surface-2 hover:text-foreground`;

function ColorButton({ color, label, onPick, children }: { color: string; label: string; onPick: (c: string) => void; children: React.ReactNode }) {
  return (
    <Popover
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className={cn(barBtn, "flex-col gap-0.5 !py-1")} title={label} aria-label={label}>
          {children}
          <span className="h-[3px] w-4 rounded-full" style={{ background: color }} />
        </button>
      )}
      className="w-[12.5rem] !p-2"
    >
      {(close) => (
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={`Colour ${c}`}
              onClick={() => {
                onPick(c);
                close();
              }}
              className={cn("h-7 w-7 rounded-lg border border-border", c === color && "ring-2 ring-accent ring-offset-1 ring-offset-card")}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </Popover>
  );
}

/** Floating toolbar for the selected drawing (TradingView style). */
export default function DrawingSettingsBar({
  drawing,
  onChange,
  onDuplicate,
  onDelete,
  onPlaceOrder,
}: {
  drawing: Drawing;
  onChange: (next: Drawing) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Position tools only: turn the projection into an order. */
  onPlaceOrder?: () => void;
}) {
  const d = drawing;
  const set = (patch: Partial<Drawing>) => onChange({ ...d, ...patch });
  const projection = d.kind === "long" || d.kind === "short";
  const textual = d.kind === "text" || d.kind === "hline" || d.kind === "trend" || d.kind === "rect";
  // A freshly placed text note opens its editor straight away (TradingView does too).
  const [textOpen, setTextOpen] = useState(d.kind === "text" && d.text === "Text");

  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-12 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-0.5 rounded-xl border border-border bg-card/95 p-1 shadow-xl backdrop-blur"
      role="toolbar"
      aria-label={`${DRAWING_NAMES[d.kind]} settings`}
      data-testid="drawing-settings"
    >
      <span className="px-1.5 text-[11px] font-semibold text-muted">{DRAWING_NAMES[d.kind]}</span>
      {projection ? (
        onPlaceOrder && (
          <button type="button" onClick={onPlaceOrder} className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-xs font-semibold text-accent-foreground hover:bg-accent-2" data-testid="projection-use">
            <Send className="h-3.5 w-3.5" /> Use as order
          </button>
        )
      ) : (
        <>
          {d.kind === "text" && (
            <ColorButton color={d.color} label="Text colour" onPick={(c) => set({ color: c })}>
              <TextIcon className="h-4 w-4" />
            </ColorButton>
          )}
          {d.kind !== "text" && (
            <ColorButton color={d.color} label="Line colour" onPick={(c) => set({ color: c })}>
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="m4 13.5 7.5-7.5 3 3L7 16.5H4z" />
                <path d="m10 7.5 3 3" />
              </svg>
            </ColorButton>
          )}
          <select className="h-8 rounded-lg bg-transparent px-1.5 text-xs font-medium hover:bg-surface-2 focus:outline-none" value={d.width ?? 1} onChange={(e) => {
              set({ width: Number(e.target.value) as 1 | 2 | 3 });
              e.currentTarget.blur(); // arrow keys go back to stepping the replay
            }} aria-label={d.kind === "text" ? "Text size" : "Line width"}>
            <option value={1}>{d.kind === "text" ? "Small" : "1px"}</option>
            <option value={2}>{d.kind === "text" ? "Medium" : "2px"}</option>
            <option value={3}>{d.kind === "text" ? "Large" : "3px"}</option>
          </select>
          {d.kind !== "text" && (
            <select className="h-8 rounded-lg bg-transparent px-1.5 text-xs font-medium hover:bg-surface-2 focus:outline-none" value={d.style ?? "solid"} onChange={(e) => {
                set({ style: e.target.value as Drawing["style"] });
                e.currentTarget.blur();
              }} aria-label="Line style">
              <option value="solid">───</option>
              <option value="dashed">─ ─ ─</option>
              <option value="dotted">· · · ·</option>
            </select>
          )}
          {textual && (
            <Popover
              open={textOpen}
              onOpenChange={setTextOpen}
              trigger={({ toggle }) => (
                <button type="button" onClick={toggle} className={barBtn} title="Settings" aria-label="Settings" data-testid="drawing-text-settings">
                  <Settings className="h-4 w-4" />
                </button>
              )}
              className="w-64"
            >
              <label className="block text-xs font-medium text-muted">
                {d.kind === "text" ? "Text" : "Label"}
                <input
                  autoFocus
                  className="input mt-1 !py-1.5 text-sm"
                  value={d.kind === "text" ? d.text ?? "" : d.label ?? ""}
                  placeholder={d.kind === "text" ? "Text" : "Optional label"}
                  onChange={(e) => set(d.kind === "text" ? { text: e.target.value } : { label: e.target.value || undefined })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") setTextOpen(false);
                  }}
                  data-testid="drawing-text"
                />
              </label>
            </Popover>
          )}
        </>
      )}
      <button type="button" className={barBtn} onClick={() => set({ locked: !d.locked })} aria-label={d.locked ? "Unlock" : "Lock"} title={d.locked ? "Unlock (allow moving)" : "Lock (prevent moving)"} aria-pressed={Boolean(d.locked)}>
        {d.locked ? <Lock className="h-4 w-4 text-accent" /> : <LockOpen className="h-4 w-4" />}
      </button>
      <button type="button" className={cn(barBase, "text-foreground/80 hover:bg-loss-soft hover:text-loss")} onClick={onDelete} aria-label="Delete drawing" title="Delete (Delete key)">
        <Trash2 className="h-4 w-4" />
      </button>
      <Popover
        align="right"
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} className={barBtn} aria-label="More" title="More">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
        className="w-48 !p-1.5"
      >
        {(close) => (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
            onClick={() => {
              close();
              onDuplicate();
            }}
          >
            <Copy className="h-3.5 w-3.5 text-muted" /> Duplicate
          </button>
        )}
      </Popover>
    </div>
  );
}
