// Monte Carlo simulation for the "Simulation" tab — bootstrap-resamples the
// historical closed-trade P&L sequence to project a fan of possible future
// equity curves. Seeded PRNG so results are reproducible until the user asks
// to re-run (no new dependency: mulberry32 is ~5 lines).

import { isClosed } from "./stats";
import type { BacktestTrade } from "./types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

export interface SimulationPoint {
  step: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface SimulationSummary {
  runs: number;
  trades: number;
  medianFinalBalance: number;
  p10FinalBalance: number;
  p90FinalBalance: number;
  probabilityOfProfit: number;
  medianMaxDrawdownPct: number;
  worstMaxDrawdownPct: number;
}

export interface SimulationResult {
  series: SimulationPoint[];
  summary: SimulationSummary;
}

export function runMonteCarloSimulation(
  trades: BacktestTrade[],
  startingBalance: number,
  opts?: { runs?: number; seed?: number },
): SimulationResult | null {
  const pnlList = trades.filter(isClosed).map((t) => t.pnl);
  const n = pnlList.length;
  if (n === 0) return null;

  const runs = opts?.runs ?? 300;
  const rng = mulberry32(opts?.seed ?? 42);

  // stepValues[step][run] = equity at that step for that run
  const stepValues: number[][] = Array.from({ length: n + 1 }, () => []);
  const finalBalances: number[] = [];
  const maxDrawdownPcts: number[] = [];

  for (let r = 0; r < runs; r++) {
    let equity = startingBalance;
    let peak = startingBalance;
    let maxDrawdownPct = 0;
    stepValues[0].push(equity);
    for (let i = 0; i < n; i++) {
      const pick = pnlList[Math.floor(rng() * n)];
      equity += pick;
      peak = Math.max(peak, equity);
      const drawdownPct = peak !== 0 ? ((equity - peak) / peak) * 100 : 0;
      maxDrawdownPct = Math.max(maxDrawdownPct, -drawdownPct);
      stepValues[i + 1].push(equity);
    }
    finalBalances.push(equity);
    maxDrawdownPcts.push(maxDrawdownPct);
  }

  const series: SimulationPoint[] = stepValues.map((values, step) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return {
      step,
      p10: percentile(sorted, 0.1),
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
    };
  });

  const sortedFinal = finalBalances.slice().sort((a, b) => a - b);
  const sortedDrawdowns = maxDrawdownPcts.slice().sort((a, b) => a - b);
  const profitable = finalBalances.filter((b) => b > startingBalance).length;

  return {
    series,
    summary: {
      runs,
      trades: n,
      medianFinalBalance: percentile(sortedFinal, 0.5),
      p10FinalBalance: percentile(sortedFinal, 0.1),
      p90FinalBalance: percentile(sortedFinal, 0.9),
      probabilityOfProfit: (profitable / runs) * 100,
      medianMaxDrawdownPct: percentile(sortedDrawdowns, 0.5),
      worstMaxDrawdownPct: percentile(sortedDrawdowns, 0.9),
    },
  };
}
