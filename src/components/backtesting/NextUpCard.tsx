"use client";

import { ArrowRight } from "lucide-react";
import type { BacktestItem } from "@/lib/types";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";

export default function NextUpCard({ items }: { items: BacktestItem[] }) {
  return (
    <Card padding="lg">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">Next Up</h2>
        <ArrowRight className="h-4 w-4 text-muted" />
      </div>
      <p className="mt-0.5 text-sm text-muted">After you complete today, this is what&apos;s next.</p>

      {items.length === 0 ? (
        <EmptyState className="py-8" title="Nothing queued" description="This will fill in as you make progress." />
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item, i) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3.5 py-3 opacity-70"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted">
                {i + 1}
              </span>
              <span className="text-sm font-medium">
                {item.instrument} {item.year}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
