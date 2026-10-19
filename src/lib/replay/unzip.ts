// Minimal ZIP reader so HistData/Dukascopy downloads can be imported without
// unzipping first. Supports "stored" and "deflate" entries via the browser's
// native DecompressionStream; ZIP64 archives (>4 GB) are not supported.

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export function isZipName(name: string): boolean {
  return /\.zip$/i.test(name);
}

export async function listZipEntries(blob: Blob): Promise<ZipEntry[]> {
  const tailSize = Math.min(blob.size, 65_557);
  const tail = new DataView(await blob.slice(blob.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid ZIP archive (end of central directory not found).");
  const total = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff) throw new Error("ZIP64 archives are not supported — unzip the file first.");
  const cd = new DataView(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const entries: ZipEntry[] = [];
  let p = 0;
  const decoder = new TextDecoder();
  for (let i = 0; i < total && p + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== CEN_SIG) break;
    const method = cd.getUint16(p + 10, true);
    const compressedSize = cd.getUint32(p + 20, true);
    const uncompressedSize = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const localHeaderOffset = cd.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    if (!name.endsWith("/")) entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Byte stream of one entry's uncompressed content. */
export async function zipEntryStream(blob: Blob, entry: ZipEntry): Promise<ReadableStream<Uint8Array>> {
  const head = new DataView(await blob.slice(entry.localHeaderOffset, entry.localHeaderOffset + 30).arrayBuffer());
  if (head.getUint32(0, true) !== LOC_SIG) throw new Error(`Corrupt ZIP entry header for ${entry.name}.`);
  const dataStart = entry.localHeaderOffset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  const raw = blob.slice(dataStart, dataStart + entry.compressedSize).stream() as ReadableStream<Uint8Array>;
  if (entry.method === 0) return raw;
  if (entry.method === 8) {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser can't decompress ZIP files — unzip the file first.");
    return raw.pipeThrough(new DecompressionStream("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>);
  }
  throw new Error(`Unsupported ZIP compression method ${entry.method} — unzip the file first.`);
}

/** Pick the data file from an archive (largest .csv/.txt). */
export function pickDataEntry(entries: ZipEntry[]): ZipEntry | null {
  const data = entries.filter((e) => /\.(csv|txt)$/i.test(e.name));
  if (!data.length) return null;
  return data.sort((a, b) => b.uncompressedSize - a.uncompressedSize)[0];
}
