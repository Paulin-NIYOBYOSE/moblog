"use client";

import { cn } from "@/lib/utils";

export default function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-shimmer rounded-2xl", className)} />;
}
