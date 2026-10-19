import { detectFormat, ImportAccumulator, type Detection, type ImportConfig, type ParsedImport } from "./csv";
import { isZipName, listZipEntries, pickDataEntry, zipEntryStream } from "./unzip";

// File reading for imports. Runs inside the import worker (preferred) or on
// the main thread as a fallback. Files are streamed line by line so large
// tick files never need to fit in memory as one string.

export interface FileDetection extends Detection {
  entryName: string | null;
  totalBytes: number;
}

async function byteStream(file: Blob, name: string, entryName: string | null): Promise<{ stream: ReadableStream<Uint8Array>; total: number; entry: string | null }> {
  if (isZipName(name)) {
    const entries = await listZipEntries(file);
    const entry = entryName ? entries.find((e) => e.name === entryName) ?? null : pickDataEntry(entries);
    if (!entry) throw new Error("No .csv file found inside the ZIP archive.");
    return { stream: await zipEntryStream(file, entry), total: entry.uncompressedSize, entry: entry.name };
  }
  return { stream: file.stream() as ReadableStream<Uint8Array>, total: file.size, entry: null };
}

export async function detectFile(file: Blob, name: string): Promise<FileDetection> {
  const { stream, total, entry } = await byteStream(file, name, null);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (text.length < 16_384) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => undefined);
  // Drop a possibly truncated last line and a UTF-8 BOM.
  const cut = text.lastIndexOf("\n");
  if (cut > 0 && text.length >= 16_384) text = text.slice(0, cut);
  text = text.replace(/^﻿/, "");
  const det = detectFormat(entry ?? name, text);
  return { ...det, entryName: entry, totalBytes: total };
}

export async function parseFile(
  file: Blob,
  name: string,
  config: ImportConfig,
  entryName: string | null,
  onProgress?: (fraction: number) => void,
): Promise<ParsedImport> {
  const { stream, total } = await byteStream(file, name, entryName);
  const acc = new ImportAccumulator(config);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  let read = 0;
  let lastReport = 0;
  let first = true;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    let chunk = rest + decoder.decode(value, { stream: true });
    if (first) {
      chunk = chunk.replace(/^﻿/, "");
      first = false;
    }
    let start = 0;
    for (;;) {
      const nl = chunk.indexOf("\n", start);
      if (nl < 0) break;
      const end = nl > start && chunk.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
      acc.pushLine(chunk.slice(start, end));
      start = nl + 1;
    }
    rest = chunk.slice(start);
    if (onProgress && total > 0 && read - lastReport > total / 100) {
      lastReport = read;
      onProgress(Math.min(0.99, read / total));
    }
  }
  rest += decoder.decode();
  if (rest.trim()) acc.pushLine(rest.replace(/\r$/, ""));
  onProgress?.(1);
  return acc.finish();
}
