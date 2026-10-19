import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { detectFormat, ImportAccumulator, parseCsvText } from "../csv";
import { detectFile, parseFile } from "../importer";
import { listZipEntries } from "../unzip";

const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;

const HISTDATA_M1 = [
  "20240102 050000;1.104270;1.104290;1.104190;1.104200;0",
  "20240102 050100;1.104200;1.104350;1.104150;1.104300;0",
  "20240102 050200;1.104300;1.104400;1.104250;1.104380;0",
  "20240102 050300;1.104380;1.104390;1.104100;1.104150;0",
].join("\n");

describe("format detection", () => {
  it("HistData Generic ASCII M1", () => {
    const d = detectFormat("DAT_ASCII_EURUSD_M1_2024.csv", HISTDATA_M1);
    expect(d.config.preset).toBe("histdata-ascii");
    expect(d.config.timezone).toBe("Etc/GMT+5");
    expect(d.config.priceBasis).toBe("bid");
    expect(d.config.symbol).toBe("EURUSD");
    expect(d.config.hasHeader).toBe(false);
    expect(d.config.columns.slice(0, 5)).toEqual(["datetime", "open", "high", "low", "close"]);
    expect(d.timeframeHint).toBe("M1");
  });

  it("HistData MetaTrader, MetaStock and tick layouts", () => {
    const mt = detectFormat("DAT_MT_GBPUSD_M1_2024.csv", "2024.01.02,00:00,1.27,1.271,1.269,1.2705,0\n2024.01.02,00:01,1.2705,1.271,1.27,1.2708,0");
    expect(mt.config.preset).toBe("histdata-mt");
    expect(mt.config.columns.slice(0, 2)).toEqual(["date", "time"]);
    const ms = detectFormat("DAT_MS_USDJPY_M1_2024.csv", "USDJPY,202401020000,141.0,141.1,140.9,141.05,0\nUSDJPY,202401020001,141.05,141.1,141.0,141.02,0");
    expect(ms.config.preset).toBe("histdata-metastock");
    expect(ms.config.hasHeader).toBe(false);
    const tick = detectFormat("DAT_ASCII_EURUSD_T_202401.csv", "20240102 000003660,1.104270,1.104370,0\n20240102 000004120,1.104280,1.104360,0");
    expect(tick.config.preset).toBe("histdata-ascii-tick");
    expect(tick.config.kind).toBe("ticks");
  });

  it("Dukascopy candles with BID in the file name", () => {
    const d = detectFormat(
      "EURUSD_Candlestick_1_M_BID_01.01.2024-31.12.2024.csv",
      "Gmt time,Open,High,Low,Close,Volume\n02.01.2024 00:00:00.000,1.10427,1.10429,1.10419,1.1042,120.5\n02.01.2024 00:01:00.000,1.1042,1.10435,1.10415,1.1043,98.1",
    );
    expect(d.config.preset).toBe("dukascopy");
    expect(d.config.hasHeader).toBe(true);
    expect(d.config.tsFormat).toBe("dmy");
    expect(d.config.timezone).toBe("UTC");
    expect(d.config.priceBasis).toBe("bid");
    expect(d.timeframeHint).toBe("M1");
  });

  it("generic header CSV warns when the price basis is unknown", () => {
    const d = detectFormat("eurusd_m15.csv", "timestamp,open,high,low,close,volume\n2024-01-02 10:00:00,1.1,1.2,1.0,1.15,10\n2024-01-02 10:15:00,1.15,1.2,1.1,1.12,10");
    expect(d.config.preset).toBe("generic");
    expect(d.config.columns).toEqual(["datetime", "open", "high", "low", "close", "volume"]);
    expect(d.config.priceBasis).toBe("unknown");
    expect(d.warnings.join(" ")).toMatch(/Price basis/);
  });

  it("MetaTrader 5 export with angle-bracket headers", () => {
    const d = detectFormat(
      "EURUSD_M5.csv",
      "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\n2024.01.02\t00:00:00\t1.1\t1.2\t1.0\t1.15\t10\t0\t12\n2024.01.02\t00:05:00\t1.15\t1.2\t1.1\t1.12\t10\t0\t11",
    );
    expect(d.config.preset).toBe("metatrader");
    expect(d.config.columns.slice(0, 7)).toEqual(["date", "time", "open", "high", "low", "close", "volume"]);
    expect(d.config.columns[8]).toBe("spread-points");
  });
});

describe("parsing and data quality", () => {
  it("normalises HistData EST timestamps to UTC", () => {
    const d = detectFormat("DAT_ASCII_EURUSD_M1_2024.csv", HISTDATA_M1);
    const p = parseCsvText(HISTDATA_M1, d.config);
    expect(p.bars.n).toBe(4);
    expect(p.bars.t[0]).toBe(utc(2024, 1, 2, 10));
    expect(p.timeframe).toBe("M1");
    expect(p.priceBasis).toBe("bid");
  });

  it("reports malformed rows, invalid OHLC, duplicates and out-of-order rows", () => {
    const text = [
      "20240102 050200;1.1;1.2;1.0;1.1;0", // out of order (sorted later)
      "20240102 050000;1.1;1.2;1.0;1.1;0",
      "20240102 050100;1.1;1.2;1.0;1.1;0",
      "20240102 050100;1.1;1.2;1.0;1.1;0", // exact duplicate
      "20240102 050100;1.1;1.3;1.0;1.1;0", // conflicting duplicate
      "20240102 050300;1.1;1.0;1.2;1.1;0", // high < low
      "20240102 050400;abc;1.2;1.0;1.1;0", // malformed number
      "2024-01-02 05:05;1.1;1.2;1.0;1.1;0", // wrong timestamp format
      "20240102 050500;1.1;1.2;1.0;1.1;0",
    ].join("\n");
    const d = detectFormat("DAT_ASCII_EURUSD_M1_2024.csv", text);
    const p = parseCsvText(text, d.config);
    expect(p.quality.rowsRead).toBe(9);
    expect(p.quality.invalidOhlc).toBe(1);
    expect(p.quality.malformed).toBe(2);
    expect(p.quality.malformedExamples[0].line).toBe(7);
    expect(p.quality.duplicates).toBe(2);
    expect(p.quality.conflictingDuplicates).toBe(1);
    expect(p.quality.outOfOrder).toBeGreaterThan(0);
    expect(Array.from(p.bars.t)).toEqual([0, 1, 2, 5].map((m) => utc(2024, 1, 2, 10, m)));
    expect(p.bars.h[1]).toBe(1.2); // first occurrence kept
    // The missing 10:03 and 10:04 minutes are reported, never filled.
    expect(p.quality.gapCount).toBe(1);
  });

  it("separates weekend closures from real gaps", () => {
    const rows: string[] = [];
    const add = (t: number) => {
      const d = new Date((t - 5 * 3600) * 1000); // to EST wall time
      const s = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}00`;
      rows.push(`${s};1.1;1.2;1.0;1.1;0`);
    };
    for (let i = 0; i < 5; i++) add(utc(2024, 1, 3, 10, i)); // Wed
    for (let i = 0; i < 5; i++) add(utc(2024, 1, 3, 13, i)); // 3h hole on Wednesday
    for (let i = 0; i < 3; i++) add(utc(2024, 1, 5, 21, 57 + i)); // Fri close
    for (let i = 0; i < 3; i++) add(utc(2024, 1, 7, 22, i)); // Sun open
    const d = detectFormat("DAT_ASCII_EURUSD_M1_2024.csv", rows.join("\n"));
    const p = parseCsvText(rows.join("\n"), d.config);
    expect(p.quality.weekendGaps).toBe(1);
    expect(p.quality.largeGaps.map((g) => g.from)).toContain(utc(2024, 1, 3, 10, 5));
    expect(p.quality.largeGaps.every((g) => g.from < utc(2024, 1, 5))).toBe(true);
  });

  it("detects M5 spacing and decimal commas", () => {
    const text = "Date;Open;High;Low;Close\n2024-01-02 10:00;1,1;1,2;1,0;1,15\n2024-01-02 10:05;1,15;1,2;1,1;1,12\n2024-01-02 10:10;1,12;1,13;1,1;1,11";
    const d = detectFormat("eurusd.csv", text);
    expect(d.config.decimalComma).toBe(true);
    const p = parseCsvText(text, { ...d.config, symbol: "EURUSD" });
    expect(p.timeframe).toBe("M5");
    expect(p.bars.c[0]).toBe(1.15);
  });

  it("aggregates bid/ask ticks into M1 candles with average spread", () => {
    const text = [
      "20240102 050000100,1.10000,1.10010,0",
      "20240102 050010000,1.10050,1.10070,0",
      "20240102 050030000,1.09980,1.09990,0",
      "20240102 050059900,1.10020,1.10030,0",
      "20240102 050100000,1.10020,1.10040,0",
    ].join("\n");
    const d = detectFormat("DAT_ASCII_EURUSD_T_202401.csv", text);
    const p = parseCsvText(text, d.config);
    expect(p.derivedFromTicks).toBe(true);
    expect(p.bars.n).toBe(2);
    expect(p.bars.t[0]).toBe(utc(2024, 1, 2, 10));
    expect([p.bars.o[0], p.bars.h[0], p.bars.l[0], p.bars.c[0]]).toEqual([1.1, 1.1005, 1.0998, 1.1002]);
    expect(p.bars.v[0]).toBe(4);
    expect(p.bars.sp![0]).toBeCloseTo((0.0001 + 0.0002 + 0.0001 + 0.0001) / 4, 7);
    expect(p.hasSpread).toBe(true);
  });

  it("validates the mapping before importing", () => {
    const d = detectFormat("x.csv", "a,b,c\n1,2,3\n4,5,6");
    expect(ImportAccumulator.validateConfig(d.config).length).toBeGreaterThan(0);
  });
});

function makeZip(name: string, content: string): Blob {
  const data = Buffer.from(content, "utf8");
  const comp = deflateRawSync(data);
  const nameBuf = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);
  cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(comp.length, 20);
  cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + comp.length;
  const cdSize = cen.length + nameBuf.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return new Blob([local, nameBuf, comp, cen, nameBuf, eocd]);
}

describe("streaming import from files and ZIP archives", () => {
  it("reads a HistData ZIP without unzipping first", async () => {
    const zip = makeZip("DAT_ASCII_EURUSD_M1_2024.csv", HISTDATA_M1 + "\n");
    const entries = await listZipEntries(zip);
    expect(entries.map((e) => e.name)).toEqual(["DAT_ASCII_EURUSD_M1_2024.csv"]);
    const det = await detectFile(zip, "HISTDATA_COM_ASCII_EURUSD_M1_2024.zip");
    expect(det.config.preset).toBe("histdata-ascii");
    expect(det.entryName).toBe("DAT_ASCII_EURUSD_M1_2024.csv");
    const fractions: number[] = [];
    const parsed = await parseFile(zip, "x.zip", det.config, det.entryName, (f) => fractions.push(f));
    expect(parsed.bars.n).toBe(4);
    expect(fractions.at(-1)).toBe(1);
  });

  it("streams plain CSV with CRLF line endings and a BOM", async () => {
    const blob = new Blob(["﻿" + HISTDATA_M1.replace(/\n/g, "\r\n")]);
    const det = await detectFile(blob, "DAT_ASCII_EURUSD_M1_2024.csv");
    const parsed = await parseFile(blob, "DAT_ASCII_EURUSD_M1_2024.csv", det.config, null);
    expect(parsed.bars.n).toBe(4);
    expect(parsed.quality.malformed).toBe(0);
  });
});
