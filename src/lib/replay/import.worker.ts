/// <reference lib="webworker" />
// Parses and stores imported market data off the main thread so the UI stays
// responsive on multi-hundred-MB tick files.

import type { ImportConfig, ParsedImport } from "@/lib/replay/csv";
import { detectFile, parseFile } from "@/lib/replay/importer";
import { commitImport, type ImportTarget } from "@/lib/replay/storage/repo";
import type { SourcePreset } from "@/lib/replay/types";
import { summarizeParsed, type WorkerRequest, type WorkerResponse } from "@/lib/replay/importProtocol";

const pending = new Map<string, ParsedImport>();

function post(msg: WorkerResponse) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case "detect": {
        const detection = await detectFile(msg.file, msg.name);
        post({ type: "detected", reqId: msg.reqId, detection });
        break;
      }
      case "parse": {
        const parsed = await parseFile(msg.file, msg.name, msg.config as ImportConfig, msg.entryName, (fraction) =>
          post({ type: "progress", reqId: msg.reqId, fraction }),
        );
        pending.set(msg.importId, parsed);
        post({ type: "parsed", reqId: msg.reqId, summary: summarizeParsed(parsed) });
        break;
      }
      case "commit": {
        const parsed = pending.get(msg.importId);
        if (!parsed) throw new Error("Import expired — parse the file again.");
        const result = await commitImport({
          parsed,
          symbol: msg.symbol,
          source: msg.source as SourcePreset,
          sourceTimezone: msg.sourceTimezone,
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          target: msg.target as ImportTarget,
        });
        pending.delete(msg.importId);
        post({ type: "committed", reqId: msg.reqId, result });
        break;
      }
      case "discard": {
        pending.delete(msg.importId);
        post({ type: "discarded", reqId: msg.reqId });
        break;
      }
    }
  } catch (e) {
    post({ type: "error", reqId: msg.reqId, message: e instanceof Error ? e.message : String(e) });
  }
};
