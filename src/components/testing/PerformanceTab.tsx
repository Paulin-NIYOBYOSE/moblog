"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import Card from "@/components/ui/Card";
import type { BacktestTrade, Session } from "@/lib/testing/types";
import { type BalanceMode, type GainMode, monthlyReturnMatrix } from "@/lib/testing/stats";
import { computeTradeFrequency } from "@/lib/testing/frequency";
import TestingPnlCard from "./TestingPnlCard";
import MonthlyPerformanceGrid from "./MonthlyPerformanceGrid";
import PerformanceCalendar from "./PerformanceCalendar";
import TradeFrequencyCharts from "./TradeFrequencyCharts";

export default function PerformanceTab({
  trades,
  sessions,
  startingBalance,
  breakevenThreshold,
  onBreakevenThresholdChange,
}: {
  trades: BacktestTrade[];
  sessions: Session[];
  startingBalance: number;
  breakevenThreshold: number;
  onBreakevenThresholdChange: (value: number) => void;
}) {
  const [gainMode, setGainMode] = useState<GainMode>("ACCUM");
  const [balanceMode, setBalanceMode] = useState<BalanceMode>("INITIAL");

  const monthlyRows = useMemo(
    () => monthlyReturnMatrix(trades, sessions, gainMode, balanceMode),
    [trades, sessions, gainMode, balanceMode],
  );
  const frequency = useMemo(() => computeTradeFrequency(trades), [trades]);

  return (
    <div className="space-y-5">
      <TestingPnlCard
        trades={trades}
        startingBalance={startingBalance}
        breakevenThreshold={breakevenThreshold}
        onBreakevenThresholdChange={onBreakevenThresholdChange}
      />

      <Card padding="lg">
        <div className="mb-1 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold">Performance by month</h3>
        </div>
        <p className="mb-4 text-xs text-muted">% return per month across the sessions in scope</p>
        <MonthlyPerformanceGrid
          rows={monthlyRows}
          gainMode={gainMode}
          balanceMode={balanceMode}
          onGainModeChange={setGainMode}
          onBalanceModeChange={setBalanceMode}
        />
      </Card>

      <Card padding="lg">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold">Performance calendar</h3>
        </div>
        <PerformanceCalendar trades={trades} startingBalance={startingBalance} />
      </Card>

      <Card padding="lg">
        <TradeFrequencyCharts byWeekday={frequency.byWeekday} byWeek={frequency.byWeek} byMonth={frequency.byMonth} />
      </Card>
    </div>
  );
}
