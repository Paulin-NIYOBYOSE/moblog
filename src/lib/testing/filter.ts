import { classifyOutcome, effectiveDate, isClosed } from "./stats";
import { zonedDateInfo } from "./timezone";
import type { BacktestTrade, TestingFilters } from "./types";

export function applyTestingFilters(trades: BacktestTrade[], filters: TestingFilters): BacktestTrade[] {
  const timeFiltered = filters.timeFrom !== "00:00" || filters.timeTo !== "23:59";

  return trades.filter((t) => {
    if (filters.status === "OPEN" && isClosed(t)) return false;
    if (filters.status === "CLOSED" && !isClosed(t)) return false;
    if (filters.sessionIds.length && !filters.sessionIds.includes(t.sessionId)) return false;
    if (filters.assets.length && !filters.assets.includes(t.pair)) return false;
    if (filters.sides.length && !filters.sides.includes(t.direction)) return false;
    if (filters.strategies.length && !(t.setup && filters.strategies.includes(t.setup))) return false;
    if (filters.tags.length && !filters.tags.some((tag) => t.tags.includes(tag))) return false;

    if (filters.outcomes.length) {
      if (!isClosed(t)) return false;
      const outcome = classifyOutcome(t.pnl, filters.breakevenThreshold);
      if (!filters.outcomes.includes(outcome)) return false;
    }

    const dateStr = effectiveDate(t).slice(0, 10);
    if (filters.dateFrom && dateStr < filters.dateFrom) return false;
    if (filters.dateTo && dateStr > filters.dateTo) return false;

    if (filters.weekdays.length || timeFiltered) {
      const { weekday, time } = zonedDateInfo(t.openDate, filters.timezone);
      if (filters.weekdays.length && !filters.weekdays.includes(weekday)) return false;
      if (timeFiltered) {
        const inRange =
          filters.timeFrom <= filters.timeTo
            ? time >= filters.timeFrom && time <= filters.timeTo
            : time >= filters.timeFrom || time <= filters.timeTo;
        if (!inRange) return false;
      }
    }

    return true;
  });
}
