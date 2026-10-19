"use client";

import type { ImportConfig, ParsedImport } from "./csv";
import { detectFile, parseFile, type FileDetection } from "./importer";
import { summarizeParsed, type ParsedSummary, type WorkerRequest, type WorkerResponse } from "./importProtocol";
import { commitImport, newId, type ImportCommitResult, type ImportTarget } from "./storage/repo";
import type { SourcePreset } from "./types";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Built from src/lib/replay/import.worker.ts by scripts/build-replay-worker.mjs. */
const WORKER_URL = "/replay-import.worker.js";

class WorkerUnavailable extends Error {}

/**
 * Import API used by the wizard. Parsing runs in a Web Worker; if the worker
 * can't start (blocked, missing file), the same code runs on the main thread,
 * streamed in chunks so the page stays responsive.
 */
export class ImportClient {
  private worker: Worker | null = null;
  private waiters = new Map<string, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void; onProgress?: (f: number) => void }>();
  private local = new Map<string, ParsedImport>();

  constructor() {
    try {
      if (typeof Worker !== "undefined") {
        const w = new Worker(WORKER_URL);
        w.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onMessage(ev.data);
        // An error *event* means the worker itself failed (load error or crash);
        // handler errors are posted back as messages instead.
        w.onerror = (ev) => {
          ev.preventDefault();
          this.dropWorker(new WorkerUnavailable(ev.message || "Import worker unavailable."));
        };
        this.worker = w;
      }
    } catch {
      this.worker = null;
    }
  }

  get usingWorker(): boolean {
    return this.worker !== null;
  }

  private dropWorker(err: Error) {
    this.worker?.terminate();
    this.worker = null;
    for (const wt of this.waiters.values()) wt.reject(err);
    this.waiters.clear();
  }

  private onMessage(msg: WorkerResponse) {
    const w = this.waiters.get(msg.reqId);
    if (!w) return;
    if (msg.type === "progress") {
      w.onProgress?.(msg.fraction);
      return;
    }
    this.waiters.delete(msg.reqId);
    if (msg.type === "error") w.reject(new Error(msg.message));
    else w.resolve(msg);
  }

  private call(req: DistributiveOmit<WorkerRequest, "reqId">, onProgress?: (f: number) => void): Promise<WorkerResponse> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new WorkerUnavailable("No worker"));
    const reqId = newId("rq_");
    return new Promise((resolve, reject) => {
      this.waiters.set(reqId, { resolve, reject, onProgress });
      worker.postMessage({ ...req, reqId } as WorkerRequest);
    });
  }

  /** Try the worker; on infrastructure failure, run locally instead. */
  private async run<T>(remote: () => Promise<T>, local: () => Promise<T>): Promise<T> {
    if (!this.worker) return local();
    try {
      return await remote();
    } catch (e) {
      if (e instanceof WorkerUnavailable) return local();
      throw e;
    }
  }

  detect(file: File): Promise<FileDetection> {
    return this.run(
      async () => {
        const r = await this.call({ type: "detect", file, name: file.name });
        if (r.type !== "detected") throw new Error("Unexpected worker response.");
        return r.detection;
      },
      () => detectFile(file, file.name),
    );
  }

  parse(importId: string, file: File, config: ImportConfig, entryName: string | null, onProgress?: (f: number) => void): Promise<ParsedSummary> {
    return this.run(
      async () => {
        const r = await this.call({ type: "parse", importId, file, name: file.name, config, entryName }, onProgress);
        if (r.type !== "parsed") throw new Error("Unexpected worker response.");
        return r.summary;
      },
      async () => {
        const parsed = await parseFile(file, file.name, config, entryName, onProgress);
        this.local.set(importId, parsed);
        return summarizeParsed(parsed);
      },
    );
  }

  async commit(
    importId: string,
    args: { symbol: string; source: SourcePreset; sourceTimezone: string; fileName: string; fileSize: number; target: ImportTarget },
  ): Promise<ImportCommitResult> {
    const parsed = this.local.get(importId);
    if (parsed) {
      const result = await commitImport({ parsed, ...args });
      this.local.delete(importId);
      return result;
    }
    if (!this.worker) throw new Error("Import expired — parse the file again.");
    const r = await this.call({ type: "commit", importId, ...args }).catch((e) => {
      throw e instanceof WorkerUnavailable ? new Error("The import worker stopped — parse the file again.") : e;
    });
    if (r.type !== "committed") throw new Error("Unexpected worker response.");
    return r.result;
  }

  async discard(importId: string) {
    this.local.delete(importId);
    if (this.worker) await this.call({ type: "discard", importId }).catch(() => undefined);
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.waiters.clear();
  }
}
