"use client";

import { useEffect, useRef } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ContextItem {
  label: string;
  hint?: string;
  icon: "buy" | "sell" | "long" | "short" | "line";
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

const ICONS = { buy: ArrowUpRight, sell: ArrowDownRight, long: TrendingUp, short: TrendingDown, line: Minus };

/** Right-click menu on the chart (FX Replay-style order placement at a price). */
export default function ChartContextMenu({ x, y, title, items, onClose }: { x: number; y: number; title: string; items: (ContextItem | "divider")[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);
  const left = typeof window !== "undefined" ? Math.min(x, window.innerWidth - 270) : x;
  const top = typeof window !== "undefined" ? Math.min(y, window.innerHeight - 40 - items.length * 34) : y;
  return (
    <div ref={ref} role="menu" className="fixed z-[60] w-64 animate-pop-in rounded-xl border border-border bg-card p-1 text-sm shadow-2xl" style={{ left, top }} data-testid="chart-context-menu">
      <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      {items.map((it, i) =>
        it === "divider" ? (
          <div key={`d${i}`} className="my-1 h-px bg-border" />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            title={it.hint}
            onClick={() => {
              onClose();
              it.run();
            }}
            className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent")}
          >
            {(() => {
              const Icon = ICONS[it.icon];
              return <Icon className={cn("h-4 w-4 shrink-0", it.icon === "buy" || it.icon === "long" ? "text-[#089981]" : it.icon === "line" ? "text-muted" : "text-[#f23645]")} />;
            })()}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{it.label}</span>
              {it.hint && it.disabled && <span className="block truncate text-[10.5px] text-loss">{it.hint}</span>}
            </span>
          </button>
        ),
      )}
    </div>
  );
}
