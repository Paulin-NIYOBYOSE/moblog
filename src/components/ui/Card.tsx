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
      ? "p-6 sm:p-7"
      : "p-4 sm:p-5";

  return (
    <div
      id={id}
      className={cn(
        "rounded-2xl border border-border bg-card shadow-sm",
        scrollMt && "scroll-mt-20",
        paddingClass,
        interactive && "transition-all duration-200 hover:border-border/80 hover:shadow-md",
        className,
      )}
    >
      {children}
    </div>
  );
}
