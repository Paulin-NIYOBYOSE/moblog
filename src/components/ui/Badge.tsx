"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "profit" | "loss" | "muted" | "accent" | "warning" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  profit: "bg-profit-soft text-profit",
  loss: "bg-loss-soft text-loss",
  muted: "bg-surface-2 text-muted",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

export default function Badge({
  tone = "muted",
  children,
  className,
  icon: Icon,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  icon?: React.ElementType;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}
