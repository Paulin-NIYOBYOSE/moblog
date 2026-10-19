import type { ImportConfig, ParsedImport } from "./csv";
import type { FileDetection } from "./importer";
import type { ImportCommitResult, ImportTarget } from "./storage/repo";
import type { PriceBasis, QualityReport, SourcePreset, Timeframe } from "./types";

export interface ParsedSummary {
  n: number;
  firstT: number;
  lastT: number;
  timeframe: Timeframe | null;
  detectedSeconds: number | null;
  quality: QualityReport;
  priceBasis: PriceBasis;
  hasSpread: boolean;
  derivedFromTicks: boolean;
}

export function summarizeParsed(p: ParsedImport): ParsedSummary {
  return {
    n: p.bars.n,
    firstT: p.firstT,
    lastT: p.lastT,
    timeframe: p.timeframe,
    detectedSeconds: p.detectedSeconds,
    quality: p.quality,
    priceBasis: p.priceBasis,
    hasSpread: p.hasSpread,
    derivedFromTicks: p.derivedFromTicks,
  };
}

export type WorkerRequest =
  | { type: "detect"; reqId: string; file: Blob; name: string }
  | { type: "parse"; reqId: string; importId: string; file: Blob; name: string; config: ImportConfig; entryName: string | null }
  | {
      type: "commit";
      reqId: string;
      importId: string;
      symbol: string;
      source: SourcePreset;
      sourceTimezone: string;
      fileName: string;
      fileSize: number;
      target: ImportTarget;
    }
  | { type: "discard"; reqId: string; importId: string };

export type WorkerResponse =
  | { type: "detected"; reqId: string; detection: FileDetection }
  | { type: "progress"; reqId: string; fraction: number }
  | { type: "parsed"; reqId: string; summary: ParsedSummary }
  | { type: "committed"; reqId: string; result: ImportCommitResult }
  | { type: "discarded"; reqId: string }
  | { type: "error"; reqId: string; message: string };
