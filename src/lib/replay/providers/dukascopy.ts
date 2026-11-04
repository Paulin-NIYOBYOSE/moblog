import { allocBars, sliceBars } from "../bars";
import type { Timeframe } from "../types";

// Dukascopy provides free historical tick data and aggregated bars
// Available at: https://www.dukascopy.com/swiss/english/marketwatch/historical/
// Data can be accessed via their JForex platform or web API
// Coverage: Comprehensive, going back to 2003 for many pairs

export const DUKASCOPY = {
  id: "dukascopy" as const,
  name: "Dukascopy historical data",
  short: "Dukascopy",
  homepage: "https://www.dukascopy.com/swiss/english/marketwatch/historical/",
  terms: "Historical forex data provided by Dukascopy for informational purposes. Stored only in your own database.",
  firstYear: 2003,
  resolutions: ["M1", "H1"] as Timeframe[],
  instruments: [
    // All major pairs
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
    // EUR crosses - complete set
    "EURJPY", "EURGBP", "EURCHF", "EURAUD", "EURCAD", "EURNZD",
    // GBP crosses - complete set
    "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD", "GBPNZD",
    // JPY crosses - ALL including missing ones
    "AUDJPY", "CADJPY", "CHFJPY", "NZDJPY",
    // Other crosses
    "AUDCAD", "AUDCHF", "AUDNZD", "CADCHF", "NZDCAD", "NZDCHF",
    // Additional pairs Dukascopy offers
    "XAUUSD", "XAGUSD", // Metals
  ],
};

export function dukascopySupports(symbol: string, resolution: Timeframe = "M1"): boolean {
  return DUKASCOPY.instruments.includes(symbol) && DUKASCOPY.resolutions.includes(resolution);
}

// Dukascopy binary data URL structure
// They use a specific binary format that needs to be parsed
export function dukascopyFileUrl(symbol: string, year: number, month: number, day: number, hour: number): string {
  const mm = String(month - 1).padStart(2, "0"); // Dukascopy uses 0-indexed months
  const dd = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  return `https://datafeed.dukascopy.com/datafeed/${symbol}/${year}/${mm}/${dd}/${hh}h_ticks.bi5`;
}
