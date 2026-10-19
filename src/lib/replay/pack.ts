import { allocBars, sliceBars } from "./bars";
import type { Bars } from "./types";

// Compact binary candle format shared by the server (database storage,
// HTTP transfer) and the browser (decoding). Prices are stored as int32
// "points" (price × scale) so values round-trip exactly; times as int32
// seconds from a base instant.
//
//   offset  size  field
//   0       4     magic 0x52504B31 ("RPK1")
//   4       4     n (uint32)
//   8       8     baseT (float64, unix seconds)
//   16      8     scale (float64, e.g. 100000)
//   24      4     flags (bit0: has spread)
//   28      4     reserved
//   32      4n    t   int32  seconds since baseT
//   …       4n    o, h, l, c  int32 points (4 columns)
//   …       4n    v   float32
//   …       4n    sp  int32 points, -1 = unknown       (only with flag bit0)
//
// All little-endian (typed arrays on a little-endian host — both V8 targets).

export const PACK_MAGIC = 0x52504b31;
const HEADER = 32;
const NO_SPREAD = -1;

export function packedSize(n: number, hasSpread: boolean): number {
  return HEADER + n * 4 * (hasSpread ? 7 : 6);
}

/** Pack bars [from, to) into one buffer. Throws if a price doesn't fit the scale exactly. */
export function packBars(b: Bars, scale: number, from = 0, to = b.n): Uint8Array {
  const n = Math.max(0, to - from);
  const hasSpread = Boolean(b.sp);
  const buf = new ArrayBuffer(packedSize(n, hasSpread));
  const dv = new DataView(buf);
  const baseT = n ? b.t[from] : 0;
  dv.setUint32(0, PACK_MAGIC, true);
  dv.setUint32(4, n, true);
  dv.setFloat64(8, baseT, true);
  dv.setFloat64(16, scale, true);
  dv.setUint32(24, hasSpread ? 1 : 0, true);
  let off = HEADER;
  const col = () => {
    const a = new Int32Array(buf, off, n);
    off += 4 * n;
    return a;
  };
  const t = col();
  const o = col();
  const h = col();
  const l = col();
  const c = col();
  const v = new Float32Array(buf, off, n);
  off += 4 * n;
  const sp = hasSpread ? col() : null;
  const pt = (x: number) => {
    const p = Math.round(x * scale);
    if (!Number.isFinite(p) || Math.abs(p) > 2_147_483_647) throw new Error(`Price ${x} doesn't fit the storage scale ${scale}.`);
    return p;
  };
  for (let k = 0; k < n; k++) {
    const i = from + k;
    t[k] = Math.round(b.t[i] - baseT);
    o[k] = pt(b.o[i]);
    h[k] = pt(b.h[i]);
    l[k] = pt(b.l[i]);
    c[k] = pt(b.c[i]);
    v[k] = b.v[i];
    if (sp && b.sp) sp[k] = Number.isFinite(b.sp[i]) ? Math.max(0, Math.round(b.sp[i] * scale)) : NO_SPREAD;
  }
  return new Uint8Array(buf);
}

/** Decode one packed buffer (may contain several concatenated packs). */
export function unpackBars(bytes: Uint8Array): Bars {
  const parts: Bars[] = [];
  let pos = 0;
  while (pos < bytes.byteLength) {
    // Copy to an aligned buffer so typed-array views are valid.
    const dv = new DataView(bytes.buffer, bytes.byteOffset + pos, Math.min(HEADER, bytes.byteLength - pos));
    if (dv.byteLength < HEADER || dv.getUint32(0, true) !== PACK_MAGIC) throw new Error("Corrupt candle data (bad header).");
    const n = dv.getUint32(4, true);
    const baseT = dv.getFloat64(8, true);
    const scale = dv.getFloat64(16, true);
    const hasSpread = (dv.getUint32(24, true) & 1) === 1;
    const size = packedSize(n, hasSpread);
    if (pos + size > bytes.byteLength) throw new Error("Corrupt candle data (truncated).");
    const body = bytes.slice(pos + HEADER, pos + size).buffer;
    const cols = (k: number) => new Int32Array(body, 4 * n * k, n);
    const t = cols(0);
    const o = cols(1);
    const h = cols(2);
    const l = cols(3);
    const c = cols(4);
    const v = new Float32Array(body, 4 * n * 5, n);
    const sp = hasSpread ? cols(6) : null;
    const out = allocBars(n, hasSpread);
    for (let i = 0; i < n; i++) {
      out.t[i] = baseT + t[i];
      out.o[i] = o[i] / scale;
      out.h[i] = h[i] / scale;
      out.l[i] = l[i] / scale;
      out.c[i] = c[i] / scale;
      out.v[i] = v[i];
      if (out.sp && sp) out.sp[i] = sp[i] === NO_SPREAD ? NaN : sp[i] / scale;
    }
    parts.push(out);
    pos += size;
  }
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((s, p) => s + p.n, 0);
  const anySpread = parts.some((p) => p.sp);
  const out = allocBars(total, anySpread);
  let k = 0;
  for (const p of parts) {
    out.t.set(p.t, k);
    out.o.set(p.o, k);
    out.h.set(p.h, k);
    out.l.set(p.l, k);
    out.c.set(p.c, k);
    out.v.set(p.v, k);
    if (out.sp) {
      if (p.sp) out.sp.set(p.sp, k);
      else out.sp.fill(NaN, k, k + p.n);
    }
    k += p.n;
  }
  return sliceBars(out, 0, total);
}

/** Smallest power-of-ten scale ≥ 10^digits that represents every price exactly. */
export function chooseScale(b: Bars, minDigits: number): number {
  for (let d = minDigits; d <= 7; d++) {
    const s = 10 ** d;
    let ok = true;
    let maxAbs = 0;
    for (let i = 0; i < b.n && ok; i++) {
      for (const x of [b.o[i], b.h[i], b.l[i], b.c[i]]) {
        const p = x * s;
        if (Math.abs(p - Math.round(p)) > 1e-6) {
          ok = false;
          break;
        }
        if (Math.abs(p) > maxAbs) maxAbs = Math.abs(p);
      }
    }
    if (ok && maxAbs < 2_000_000_000) return s;
  }
  // Fall back to the largest scale that fits (rounding below 1e-7 relative).
  return 10 ** minDigits;
}
