"use client";

import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import type { Trade } from "@/lib/types";
import { formatCurrency, isClosed } from "@/lib/utils";
import Card from "./ui/Card";

export default function OpenPositions({
  trades,
  onEdit,
}: {
  trades: Trade[];
  onEdit: (trade: Trade) => void;
}) {
  const open = trades.filter((t) => !isClosed(t));
  if (open.length === 0) return null;

  return (
    <Card padding="lg">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold">Open positions ({open.length})</h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {open.map((t, i) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => onEdit(t)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.03 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-left transition-colors hover:border-accent/40"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: t.direction === "LONG" ? "var(--profit-soft)" : "var(--loss-soft)",
                  color: t.direction === "LONG" ? "var(--profit)" : "var(--loss)",
                }}
              >
                {t.direction === "LONG" ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
              </span>
              <div>
                <div className="font-medium">{t.pair}</div>
                <div className="text-xs text-muted">{t.setup || "No setup"}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted">Entry</div>
              <div className="font-semibold tabular-nums">
                {t.entry ? formatCurrency(t.entry) : "—"}
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </Card>
  );
}
