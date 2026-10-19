"use client";

import { ensureProviderData, type DataRequest, type PipelineProgress, type PipelineResult } from "./marketData";

export interface DataJob {
  promise: Promise<PipelineResult>;
  cancel: () => void;
}

/**
 * Prepare historical data for a request. The heavy lifting (download, gunzip,
 * parsing, validation, storage) happens on the server one week at a time; the
 * page only coordinates, so this stays responsive on the main thread.
 */
export function prepareData(request: DataRequest, onProgress: (p: PipelineProgress) => void): DataJob {
  const ctrl = new AbortController();
  return { promise: ensureProviderData(request, { onProgress, signal: ctrl.signal }), cancel: () => ctrl.abort() };
}
