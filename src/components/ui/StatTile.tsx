"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Accent = "profit" | "loss" | "muted" | "accent" | "warning" | "info";

const ACCENT_TEXT: Record<Accent, string> = {
  profit: "text-profit",
  loss: "text-loss",
  muted: "text-muted",
  accent: "text-accent",
  warning: "text-warning",
  info: "text-info",
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
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:border-border/80 hover:shadow-md sm:p-5",
        className,
      )}
    >
      <div className="absolute right-0 top-0 h-24 w-24 -translate-y-1/2 translate-x-1/2 rounded-full bg-accent/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium uppercase tracking-wide text-muted">
            {label}
          </span>
          <Icon className={cn("h-4 w-4 shrink-0", ACCENT_TEXT[accent])} />
        </div>
        {children}
      </div>
    </div>
  );
}
