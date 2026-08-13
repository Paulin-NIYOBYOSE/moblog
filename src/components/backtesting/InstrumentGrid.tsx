"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InstrumentProgress } from "@/lib/types";
import { cn } from "@/lib/utils";
import Card from "@/components/ui/Card";
import InstrumentDetailModal from "./InstrumentDetailModal";

export default function InstrumentGrid({
  instruments,
  onToggle,
}: {
  instruments: InstrumentProgress[];
  onToggle: (id: string, completed: boolean) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const active = instruments.find((i) => i.instrument === selected) ?? null;

  function viewGallery(instrument: string, year: number) {
    setSelected(null);
    router.push(`/backtesting/gallery?instrument=${instrument}&year=${year}`);
  }

  return (
    <Card padding="lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">Instrument Progress</h2>
        <span className="text-sm text-muted">{instruments.length} instruments</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {instruments.map((inst) => (
          <button
            key={inst.instrument}
            type="button"
            onClick={() => setSelected(inst.instrument)}
            className={cn(
              "flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-2/80",
              inst.completed === inst.total && "border-profit/30 bg-profit-soft/60",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold tracking-tight">{inst.instrument}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {inst.completed}/{inst.total} · {inst.percent.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.min(100, inst.percent)}%` }}
              />
            </div>
          </button>
        ))}
      </div>

      <InstrumentDetailModal
        instrument={active}
        onClose={() => setSelected(null)}
        onToggle={onToggle}
        onViewGallery={viewGallery}
      />
    </Card>
  );
}
