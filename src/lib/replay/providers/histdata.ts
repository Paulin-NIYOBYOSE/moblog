import { allocBars, sliceBars } from "../bars";
import type { Timeframe } from "../types";
import { emptyQuality, type ParsedCandles } from "./fxcm";

// HistData.com provides free historical FX data at 1-minute resolution
// Available at: https://www.histdata.com/download-free-forex-data/
// Data is available as monthly ZIP files containing CSV data
// Coverage: 2000+ for major pairs, varies by instrument

export const HISTDATA = {
  id: "histdata" as const,
  name: "HistData.com historical data",
  short: "HistData",
  homepage: "https://www.histdata.com/",
  terms: "Free historical forex data for personal use. Stored only in your own database, never redistributed.",
  firstYear: 2000,
  resolutions: ["M1"] as Timeframe[],
  instruments: [
    // Major pairs
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
    // EUR crosses
    "EURJPY", "EURGBP", "EURCHF", "EURAUD", "EURCAD", "EURNZD",
    // GBP crosses
    "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD", "GBPNZD",
    // JPY crosses
    "AUDJPY", "CADJPY", "CHFJPY", "NZDJPY",
    // Other crosses
    "AUDCAD", "AUDCHF", "AUDNZD", "CADCHF", "NZDCAD", "NZDCHF",
  ],
};

export function histdataSupports(symbol: string, resolution: Timeframe = "M1"): boolean {
  return HISTDATA.instruments.includes(symbol) && HISTDATA.resolutions.includes(resolution);
}

// HistData.com URL structure for downloads
// Format: https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/{pair}/{year}
export function histdataFileUrl(symbol: string, year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  // Note: HistData requires manual download or API integration
  // This URL structure is for reference - actual implementation may require
  // user to download and import files manually
  return `https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/${symbol.toLowerCase()}/${year}`;
}
