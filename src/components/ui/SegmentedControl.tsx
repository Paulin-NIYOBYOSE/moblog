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
  size = "sm",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  showLabels?: boolean;
  size?: "sm" | "md";
}) {
  const layoutId = useId();

  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[0.7rem] border border-border bg-surface-2 p-0.5 no-scrollbar",
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
              "relative z-10 flex shrink-0 items-center justify-center gap-1.5 rounded-[0.55rem] font-medium whitespace-nowrap transition-colors",
              size === "md" ? "h-8 px-3 text-[0.8rem]" : "h-7 px-2.5 text-xs",
              active ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-[0.55rem] border border-border bg-card shadow-sm"
                transition={{ type: "spring", bounce: 0.18, duration: 0.4 }}
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
