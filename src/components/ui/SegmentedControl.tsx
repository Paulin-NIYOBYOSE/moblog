"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ElementType;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  showLabels = true,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  showLabels?: boolean;
}) {
  const layoutId = useId();

  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-10 flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
              active ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-md bg-card shadow-sm"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {showLabels && opt.label && (
              <span className={Icon ? "hidden sm:inline" : undefined}>{opt.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
