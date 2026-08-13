"use client";

import { Camera, Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { InstrumentProgress } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function InstrumentDetailModal({
  instrument,
  onClose,
  onToggle,
  onViewGallery,
}: {
  instrument: InstrumentProgress | null;
  onClose: () => void;
  onToggle: (id: string, completed: boolean) => void;
  onViewGallery: (instrument: string, year: number) => void;
}) {
  return (
    <AnimatePresence>
      {instrument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 340 }}
            className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-semibold">{instrument.instrument}</h2>
              <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">
              {instrument.completed} / {instrument.total} years · {instrument.percent.toFixed(0)}%
            </p>

            <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.min(100, instrument.percent)}%` }}
              />
            </div>

            <div className="space-y-2">
              {instrument.items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                    item.completed ? "border-profit/30 bg-profit-soft" : "border-border bg-surface-2",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onToggle(item.id, !item.completed)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                        item.completed ? "bg-profit text-white" : "border border-border bg-surface",
                      )}
                    >
                      {item.completed && <Check className="h-3 w-3" />}
                    </span>
                    <span className="text-sm font-medium">{item.year}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewGallery(instrument.instrument, item.year)}
                    title="View screenshots"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
