"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Accent = "profit" | "loss" | "muted" | "accent" | "warning" | "info" | "gold";

const ACCENT_CHIP: Record<Accent, string> = {
  profit: "bg-profit-soft text-profit",
  loss: "bg-loss-soft text-loss",
  muted: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  gold: "bg-gold-soft text-gold",
};

export default function StatTile({
  label,
  icon: Icon,
  accent = "muted",
  children,
  className,
}: {
  label: string;
  icon: React.ElementType;
  accent?: Accent;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card transition-all duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md",
        className,
      )}
    >
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
            {label}
          </span>
          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", ACCENT_CHIP[accent])}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
