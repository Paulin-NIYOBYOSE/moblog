"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function Card({
  children,
  className,
  id,
  scrollMt = false,
  padding = "md",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  scrollMt?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
}) {
  const paddingClass =
    padding === "none"
      ? ""
      : padding === "sm"
      ? "p-3.5 sm:p-4"
      : padding === "lg"
      ? "p-5 sm:p-6"
      : "p-4 sm:p-5";

  return (
    <div
      id={id}
      className={cn(
        "relative rounded-2xl border border-border bg-card shadow-card",
        scrollMt && "scroll-mt-20",
        paddingClass,
        interactive && "transition-all duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Consistent card heading: icon chip + title + optional subtitle and right-side action. */
export function CardHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
  tone = "accent",
}: {
  icon?: React.ElementType;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  tone?: "accent" | "profit" | "loss" | "gold" | "info" | "warning" | "muted";
}) {
  const toneClass: Record<string, string> = {
    accent: "bg-accent-soft text-accent",
    profit: "bg-profit-soft text-profit",
    loss: "bg-loss-soft text-loss",
    gold: "bg-gold-soft text-gold",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
    muted: "bg-surface-2 text-muted",
  };
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className={cn("mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", toneClass[tone])}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[0.9rem] font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
