import { beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/mt5/sync/route";
import { buildPositions, normalizePair, parseMt5Payload, type Mt5Deal, type Mt5Payload } from "../deals";
import { buildExpertAdvisor } from "../expertAdvisor";
import { hashSyncKey, ingestMt5Payload, newSyncKey } from "../server";

const hasDb = Boolean(inject("testDbUrl"));
const OFFSET = 3 * 3600; // a typical UTC+3 broker server clock
/** Server-clock seconds for a UTC wall time. */
const srv = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000 + OFFSET;

let seq = 1000;
function deal(over: Partial<Mt5Deal> & Pick<Mt5Deal, "position" | "entry" | "time">): Mt5Deal {
  return {
    ticket: String(seq++),
    side: "buy",
    symbol: "EURUSD",
    volume: 1,
    price: 1.1,
    profit: 0,
    commission: 0,
    swap: 0,
    fee: 0,
    sl: null,
    tp: null,
    reason: "manual",
    risk: null,
    ...over,
  };
}

const payload = (deals: Mt5Deal[], login = "5551234"): Mt5Payload => ({
  login,
  server: "Broker-Live",
  serverUtcOffset: OFFSET,
  deals,
});

/** Long 1 lot EURUSD, 20-pip stop worth $200, closed at TP for +$400 - $6 fees. */
function tpTrade(position = "77001") {
  return [
    deal({ position, entry: "in", time: srv(2026, 10, 20, 8, 30), price: 1.1, sl: 1.098, tp: 1.104, commission: -3, risk: 200 }),
    deal({ position, entry: "out", side: "sell", time: srv(2026, 10, 20, 14, 0), price: 1.104, profit: 400, commission: -3, sl: 1.098, tp: 1.104, reason: "tp" }),
  ];
}

describe("buildPositions", () => {
  it("turns an entry and exit deal into one closed trade", () => {
    const [p] = buildPositions(payload(tpTrade()));
    expect(p).toMatchObject({
      ticket: "77001",
      pair: "EURUSD",
      direction: "LONG",
      entry: 1.1,
      exit: 1.104,
      stopLoss: 1.098,
      takeProfit: 1.104,
      size: 1,
      pnl: 394,
      riskAmount: 200,
      rr: 1.97,
      exitLogic: "Full TP",
    });
    // Server clock (UTC+3) converted back to UTC.
    expect(p.openDate.toISOString()).toBe("2026-10-20T08:30:00.000Z");
    expect(p.closeDate?.toISOString()).toBe("2026-10-20T14:00:00.000Z");
  });

  it("keeps a partially closed position open with the P&L realized so far", () => {
    const position = "77002";
    const [p] = buildPositions(
      payload([
        deal({ position, entry: "in", side: "sell", time: srv(2026, 10, 21, 9), volume: 2, price: 1.2 }),
        deal({ position, entry: "out", side: "buy", time: srv(2026, 10, 21, 10), volume: 1, price: 1.19, profit: 1000, swap: -2 }),
      ]),
    );
    expect(p).toMatchObject({ direction: "SHORT", size: 2, exit: 1.19, closeDate: null, pnl: 998, rr: null, exitLogic: null });
  });

  it("averages scale-ins and partial exits, and closes on the last exit", () => {
    const position = "77003";
    const [p] = buildPositions(
      payload([
        deal({ position, entry: "in", time: srv(2026, 10, 1, 8), volume: 1, price: 2000, symbol: "XAUUSD.r", sl: 1990, risk: 1000 }),
        deal({ position, entry: "in", time: srv(2026, 10, 1, 9), volume: 1, price: 2004, symbol: "XAUUSD.r", sl: 1990, risk: 1400 }),
        deal({ position, entry: "out", side: "sell", time: srv(2026, 10, 1, 10), volume: 1, price: 2010, profit: 1000 }),
        deal({ position, entry: "out", side: "sell", time: srv(2026, 10, 1, 11), volume: 1, price: 2002, profit: -200, reason: "sl" }),
      ]),
    );
    expect(p).toMatchObject({ pair: "XAUUSD", entry: 2002, exit: 2006, size: 2, pnl: 800, riskAmount: 2400, rr: 0.33, exitLogic: "Break-even" });
    expect(p.closeDate?.toISOString()).toBe("2026-10-01T11:00:00.000Z");
  });

  it("skips positions whose opening deal wasn't sent and ignores repeated deals", () => {
    const [entry, exit] = tpTrade("77004");
    const orphan = deal({ position: "77005", entry: "out", time: srv(2026, 10, 2) });
    const positions = buildPositions(payload([entry, exit, exit, orphan]));
    expect(positions.map((p) => p.ticket)).toEqual(["77004"]);
    expect(positions[0].pnl).toBe(394);
  });

  it("labels stop-loss exits and leaves R empty without a stop", () => {
    const position = "77006";
    const [p] = buildPositions(
      payload([
        deal({ position, entry: "in", time: srv(2026, 10, 3, 8), price: 1.3 }),
        deal({ position, entry: "out", side: "sell", time: srv(2026, 10, 3, 9), price: 1.29, profit: -100, sl: 1.29, reason: "sl" }),
      ]),
    );
    expect(p).toMatchObject({ exitLogic: "Stop loss", stopLoss: 1.29, riskAmount: null, rr: null });
  });
});

describe("normalizePair", () => {
  it("strips broker suffixes", () => {
    expect(normalizePair("EURUSD")).toBe("EURUSD");
    expect(normalizePair("EURUSD.raw")).toBe("EURUSD");
    expect(normalizePair("XAUUSD+")).toBe("XAUUSD");
    expect(normalizePair("GBPUSD-ECN")).toBe("GBPUSD");
    expect(normalizePair("EURUSDm")).toBe("EURUSD");
    expect(normalizePair("US30")).toBe("US30");
    expect(normalizePair("btcusd")).toBe("BTCUSD");
  });
});

describe("parseMt5Payload", () => {
  it("accepts the EA's payload and treats zero stops as none", () => {
    const parsed = parseMt5Payload({
      version: 1,
      login: "5551234",
      server: "Broker-Live",
      currency: "USD",
      serverUtcOffset: 10800,
      deals: [{ ticket: "1", position: "2", time: 1760000000, side: "buy", entry: "in", symbol: "EURUSD", volume: 0.5, price: 1.1, profit: 0, commission: -1, swap: 0, fee: 0, sl: 0, tp: 0, reason: "manual", risk: null }],
    });
    expect("payload" in parsed && parsed.payload.deals[0]).toMatchObject({ sl: null, tp: null, commission: -1, volume: 0.5 });
  });

  it("rejects malformed requests", () => {
    expect(parseMt5Payload(null)).toHaveProperty("error");
    expect(parseMt5Payload({ login: "x", deals: [] })).toHaveProperty("error");
    expect(parseMt5Payload({ login: "1", deals: "nope" })).toHaveProperty("error");
    expect(parseMt5Payload({ login: "1", deals: [{ ticket: "1", position: "2", time: 1, side: "long", entry: "in", symbol: "X", volume: 1, price: 1 }] })).toHaveProperty("error");
    expect(parseMt5Payload({ login: "1", serverUtcOffset: 99 * 3600, deals: [] })).toHaveProperty("error");
  });
});

describe("buildExpertAdvisor", () => {
  it("fills in the address, key and start date", () => {
    const src = buildExpertAdvisor({ url: "https://moblog.example.com", key: "mt5_abc-DEF_123", from: "2026-10-01" });
    expect(src).toContain('input string   InpUrl  = "https://moblog.example.com";');
    expect(src).toContain('input string   InpKey  = "mt5_abc-DEF_123";');
    expect(src).toContain("input datetime InpFrom = D'2026.10.01';");
    expect(src).not.toContain("__MOBLOG_");
    // MQL5 escapes survive the template untouched.
    expect(src).toContain(String.raw`"Content-Type: application/json\r\nAuthorization: Bearer "`);
  });

  it("defaults to the whole history and sanitizes its inputs", () => {
    const src = buildExpertAdvisor({ url: 'https://x.test/"; Alert(1); //', key: "mt5_ok\"bad" });
    expect(src).toContain("D'1970.01.01'");
    expect(src).toContain('InpKey  = "mt5_okbad";');
    expect(src).not.toContain('x.test/";');
  });
});

describe.skipIf(!hasDb)("MT5 sync (database)", () => {
  let accountId: string;
  let key: string;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "Trade", "JournalEntry", "Account" CASCADE`);
    key = newSyncKey();
    const account = await prisma.account.create({ data: { name: "Live", mt5KeyHash: hashSyncKey(key) } });
    accountId = account.id;
  });

  const account = async () => (await prisma.account.findUnique({ where: { id: accountId } }))!;
  const post = (body: unknown, auth = `Bearer ${key}`) =>
    POST(new Request("http://localhost/api/mt5/sync", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("imports trades once and updates them on later syncs without touching notes", async () => {
    const first = await ingestMt5Payload(await account(), payload(tpTrade()));
    expect(first).toEqual({ positions: 1, created: 1, updated: 0, open: 0 });

    const [trade] = await prisma.trade.findMany({ where: { accountId } });
    expect(trade).toMatchObject({ mt5Ticket: "77001", pair: "EURUSD", pnl: 394, rr: 1.97, exitLogic: "Full TP" });
    expect((await account()).mt5Login).toBe("5551234");

    // The trader journals the trade by hand...
    await prisma.trade.update({ where: { id: trade.id }, data: { setup: "London sweep", comment: "Patient entry", exitLogic: "BCS full TP" } });

    // ...and the same history arrives again: nothing to change.
    expect(await ingestMt5Payload(await account(), payload(tpTrade()))).toMatchObject({ created: 0, updated: 0 });

    // A broker correction (swap posted later) updates the numbers only.
    const corrected = tpTrade();
    corrected[1].swap = -1.5;
    expect(await ingestMt5Payload(await account(), payload(corrected))).toMatchObject({ created: 0, updated: 1 });
    const after = await prisma.trade.findUniqueOrThrow({ where: { id: trade.id } });
    expect(after).toMatchObject({ pnl: 392.5, setup: "London sweep", comment: "Patient entry", exitLogic: "BCS full TP" });
    expect(await prisma.trade.count()).toBe(1);
  });

  it("closes an open trade when its exit arrives", async () => {
    const [entry, exit] = tpTrade("88001");
    expect(await ingestMt5Payload(await account(), payload([entry]))).toMatchObject({ created: 1, open: 1 });
    expect((await prisma.trade.findFirstOrThrow()).closeDate).toBeNull();

    await ingestMt5Payload(await account(), payload([entry, exit]));
    const trade = await prisma.trade.findFirstOrThrow();
    expect(trade.closeDate?.toISOString()).toBe("2026-10-20T14:00:00.000Z");
    expect(trade.pnl).toBe(394);
  });

  it("authenticates the EA by its key and refuses a different MT5 login", async () => {
    expect((await post(payload([]), "Bearer mt5_wrong")).status).toBe(401);
    expect((await post(payload([]), "")).status).toBe(401);
    expect((await post({ login: "5551234", deals: "x" })).status).toBe(400);

    const ok = await post({ ...payload(tpTrade()), version: 1, currency: "USD" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, created: 1 });
    expect((await account()).mt5SyncedAt).not.toBeNull();

    const other = await post(payload(tpTrade("99001"), "999"));
    expect(other.status).toBe(409);
    expect(await prisma.trade.count()).toBe(1);
  });
});
