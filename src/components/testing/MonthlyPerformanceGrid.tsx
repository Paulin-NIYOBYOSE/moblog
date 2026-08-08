"use client";

import { CalendarRange } from "lucide-react";
import type { BalanceMode, GainMode, MonthlyMatrixRow } from "@/lib/testing/stats";
import { MONTHS, cn, formatSignedPercent } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";

function RadioOption({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 items-center justify-center rounded-full border",
          active ? "border-accent" : "border-border",
        )}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      </span>
      <span className={active ? "text-foreground" : undefined}>{label}</span>
    </button>
  );
}

export default function MonthlyPerformanceGrid({
  rows,
  gainMode,
  balanceMode,
  onGainModeChange,
  onBalanceModeChange,
}: {
  rows: MonthlyMatrixRow[];
  gainMode: GainMode;
  balanceMode: BalanceMode;
  onGainModeChange: (mode: GainMode) => void;
  onBalanceModeChange: (mode: BalanceMode) => void;
}) {
  const totalPct = rows.reduce((sum, r) => sum + r.yearReturnPct, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <RadioOption
            active={gainMode === "ACCUM"}
            label="Accum. Sessions Gains %"
            onClick={() => onGainModeChange("ACCUM")}
          />
          <RadioOption
            active={gainMode === "OVERALL"}
            label="Overall Gain %"
            onClick={() => onGainModeChange("OVERALL")}
          />
        </div>
        <div className="flex items-center gap-4">
          <RadioOption
            active={balanceMode === "INITIAL"}
            label="Initial Balance"
            onClick={() => onBalanceModeChange("INITIAL")}
          />
          <RadioOption
            active={balanceMode === "CURRENT"}
            label="Current Balance"
            onClick={() => onBalanceModeChange("CURRENT")}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No closed trades yet." className="py-6" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-1 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-2 py-1.5 font-medium" />
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
                          className="flex flex-col items-center justify-center rounded-lg px-1 py-2"
                          style={{
                            backgroundColor: cell.pnl >= 0 ? "var(--profit-soft)" : "var(--loss-soft)",
                          }}
                          title={`${cell.trades} trade${cell.trades === 1 ? "" : "s"}`}
                        >
                          <span
                            className="text-[11px] font-semibold tabular-nums"
                            style={{ color: cell.pnl >= 0 ? "var(--profit)" : "var(--loss)" }}
                          >
                            {formatSignedPercent(cell.returnPct, 2)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center rounded-lg bg-surface-2/40 py-2 text-[11px] text-muted">
                          -
                        </div>
                      )}
                    </td>
                  ))}
                  <td
                    className="rounded-lg bg-surface-2 px-2 py-2 text-right text-xs font-semibold tabular-nums"
                    style={{ color: row.yearReturnPct >= 0 ? "var(--profit)" : "var(--loss)" }}
                  >
                    {formatSignedPercent(row.yearReturnPct, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex items-center justify-end gap-3">
            <span className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted">Total</span>
            <span
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-semibold tabular-nums"
              style={{ color: totalPct >= 0 ? "var(--profit)" : "var(--loss)" }}
            >
              {formatSignedPercent(totalPct, 2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
