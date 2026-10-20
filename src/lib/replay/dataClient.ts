"use client";

import { ensureProviderData, type DataRequest, type PipelineProgress, type PipelineResult } from "./marketData";

export interface DataJob {
  promise: Promise<PipelineResult>;
  cancel: () => void;
}

export interface DataPart {
  label: string;
  request: DataRequest;
}

/**
 * Prepare historical data for one or more requests, in order (e.g. the replay
 * period's 1-minute data, then older hourly history). The heavy lifting
 * (download, gunzip, parsing, validation, storage) happens on the server one
 * week at a time; the page only coordinates, so it stays responsive.
 *
 * The result is the first part's (its dataset is the session's), with missing
 * and unpublished weeks of every part.
 */
export function prepareData(parts: DataPart[], onProgress: (p: PipelineProgress, part: number) => void): DataJob {
  const ctrl = new AbortController();
  const run = async (): Promise<PipelineResult> => {
    let first: PipelineResult | null = null;
    const missing: string[] = [];
    const unpublished: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const { request } = parts[i];
      // Hourly files are tiny, so more of them can be fetched at once.
      const r = await ensureProviderData(request, { onProgress: (p) => onProgress(p, i), signal: ctrl.signal, concurrency: request.resolution === "M1" ? 2 : 4 });
      const tag = parts.length > 1 && i > 0 ? `${request.resolution} ` : "";
      missing.push(...r.missing.map((w) => tag + w));
      unpublished.push(...r.unpublished.map((w) => tag + w));
      first ??= r;
      if (r.cancelled) return { ...first, missing, unpublished, cancelled: true };
    }
    return { ...first!, missing, unpublished };
  };
  return { promise: run(), cancel: () => ctrl.abort() };
}
