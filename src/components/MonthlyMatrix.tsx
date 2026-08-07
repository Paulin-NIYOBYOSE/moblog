"use client";

import { CalendarRange } from "lucide-react";
import type { MonthlyMatrixRow } from "@/lib/types";
import { formatSignedCurrency, formatSignedPercent, MONTHS } from "@/lib/utils";
import EmptyState from "./ui/EmptyState";

export default function MonthlyMatrix({ rows }: { rows: MonthlyMatrixRow[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={CalendarRange} title="No closed trades yet." className="py-6" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-1 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-2 py-1.5 font-medium">Year</th>
            {MONTHS.map((m) => (
              <th key={m} className="px-1 py-1.5 text-center font-medium">
                {m.slice(0, 3)}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right font-medium">YTD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year}>
              <td className="rounded-lg bg-surface-2 px-2 py-2 text-center text-xs font-semibold tabular-nums">
                {row.year}
              </td>
              {row.months.map((cell, i) => (
                <td key={i} className="p-0">
                  {cell ? (
                    <div
                      className="flex flex-col items-center justify-center rounded-lg px-1 py-1.5"
                      style={{
                        backgroundColor: cell.pnl >= 0 ? "var(--profit-soft)" : "var(--loss-soft)",
                      }}
                      title={`${formatSignedCurrency(cell.pnl)} · ${cell.trades} trade${cell.trades === 1 ? "" : "s"}`}
                    >
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: cell.pnl >= 0 ? "var(--profit)" : "var(--loss)" }}
                      >
                        {formatSignedPercent(cell.returnPct, 1)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center rounded-lg bg-surface-2/40 py-1.5 text-[11px] text-muted">
                      —
                    </div>
                  )}
                </td>
              ))}
              <td
                className="rounded-lg px-2 py-2 text-right text-xs font-semibold tabular-nums"
                style={{ color: row.yearPnl >= 0 ? "var(--profit)" : "var(--loss)" }}
              >
                {formatSignedPercent(row.yearReturnPct, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
