"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-5 py-10 text-center", className)}>
      {Icon && (
        <div className="relative mb-4">
          <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-accent/10 blur-xl" />
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-2 text-muted shadow-card">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
