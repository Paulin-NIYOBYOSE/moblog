"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookMarked, FlaskConical } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Skeleton from "@/components/ui/Skeleton";
import { V2Hero, V2PairModal, V2TodayCard, V2UpNext } from "@/components/backtest-v2/V2Overview";
import V2Schedule from "@/components/backtest-v2/V2Schedule";
import { useBacktestV2Data } from "@/lib/useBacktestV2Data";
import { computeV2Summary } from "@/lib/backtestV2";
import { STRATEGY_NAME } from "@/lib/strategy";
import type { BtItem } from "@/lib/types";
import { todayKey } from "@/lib/utils";

export default function BacktestingV2Page() {
  const { items, loading, error, patchItem, addImages, removeImage, editImage } = useBacktestV2Data();
  const today = todayKey();
  const summary = useMemo(() => computeV2Summary(items, today), [items, today]);
  const [pair, setPair] = useState<string | null>(null);

  // Most recent completion — offered as a one-click undo.
  const lastDone = useMemo(
    () =>
      items
        .filter((i) => i.completed && i.completedAt)
        .sort((a, b) => (b.completedAt as string).localeCompare(a.completedAt as string))[0] ?? null,
    [items],
  );

  const toggle = (item: BtItem) => patchItem(item.id, { completed: !item.completed });

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <FlaskConical className="h-3 w-3" /> {STRATEGY_NAME} · progress tracker
          </>
        }
        title="Backtesting v2"
        subtitle="28 pairs × 2024–2025 — one pair-year a day from Nov 1 to Dec 31, 2026. Mark each day done; record a pair's results once both years are finished."
        actions={
          <Link href="/daily-journal?view=playbook" className="btn btn-secondary">
            <BookMarked className="h-4 w-4" /> Strategy playbook
          </Link>
        }
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-loss">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          <Skeleton className="h-52" />
          <div className="grid gap-5 lg:grid-cols-3">
            <Skeleton className="h-72 lg:col-span-2" />
            <Skeleton className="h-72" />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <V2Hero summary={summary} today={today} />
          <div className="grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <V2TodayCard
                summary={summary}
                lastDone={lastDone}
                today={today}
                onDone={(i) => patchItem(i.id, { completed: true })}
                onUndo={(i) => patchItem(i.id, { completed: false })}
                onOpenPair={setPair}
              />
            </div>
            <div className="lg:col-span-2">
              <V2UpNext summary={summary} />
            </div>
          </div>
          <V2Schedule items={items} today={today} onToggle={toggle} onOpenPair={setPair} />
        </div>
      )}

      <V2PairModal
        instrument={pair}
        items={items}
        onClose={() => setPair(null)}
        onToggle={toggle}
        onSaveNotes={(i, notes) => patchItem(i.id, { notes })}
        onAddImages={(i, files) => addImages(i.id, files)}
        onRemoveImage={(i, id) => removeImage(i.id, id)}
        onEditImage={(i, id, patch) => editImage(i.id, id, patch)}
      />
    </div>
  );
}
