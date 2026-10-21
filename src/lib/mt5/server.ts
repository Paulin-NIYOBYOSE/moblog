// MT5 auto-sync — connection keys and writing synced positions to the trade
// log. See ./deals.ts for how deals become positions.

import { createHash, randomBytes } from "node:crypto";
import type { Account, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPositions, type Mt5Payload, type Mt5Position } from "./deals";

export class Mt5SyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A fresh connection key — shown once, only its hash is stored. */
export function newSyncKey(): string {
  return `mt5_${randomBytes(24).toString("base64url")}`;
}

export function hashSyncKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function accountForSyncKey(key: string): Promise<Account | null> {
  if (!key.startsWith("mt5_")) return null;
  return prisma.account.findUnique({ where: { mt5KeyHash: hashSyncKey(key) } });
}

/** An account as the browser sees it: sync status, never the key hash. */
export function toPublicAccount<T extends Account>(account: T) {
  const { mt5KeyHash, ...rest } = account;
  return { ...rest, mt5Connected: mt5KeyHash !== null };
}

/** Columns MT5 is the source of truth for — refreshed on every sync. */
function brokerFields(p: Mt5Position) {
  return {
    pair: p.pair,
    direction: p.direction,
    openDate: p.openDate,
    closeDate: p.closeDate,
    entry: p.entry,
    exit: p.exit,
    size: p.size,
    pnl: p.pnl,
  };
}

type ExistingTrade = Prisma.TradeGetPayload<{ select: typeof EXISTING_SELECT }>;
const EXISTING_SELECT = {
  id: true,
  mt5Ticket: true,
  pair: true,
  direction: true,
  openDate: true,
  closeDate: true,
  entry: true,
  exit: true,
  size: true,
  pnl: true,
  stopLoss: true,
  takeProfit: true,
  riskAmount: true,
  rr: true,
  exitLogic: true,
} as const;

/**
 * What changed for an already-imported trade. Stops, targets, risk and R are
 * only filled in when MT5 knows them, so values typed in by hand survive, and
 * exit logic is set once. Setup, comment and chart link are never touched.
 */
function tradeUpdate(prev: ExistingTrade, p: Mt5Position): Prisma.TradeUpdateInput | null {
  const next: Record<string, unknown> = { ...brokerFields(p) };
  if (p.stopLoss !== null) next.stopLoss = p.stopLoss;
  if (p.takeProfit !== null) next.takeProfit = p.takeProfit;
  if (p.riskAmount !== null) next.riskAmount = p.riskAmount;
  if (p.rr !== null) next.rr = p.rr;
  if (prev.exitLogic === null && p.exitLogic !== null) next.exitLogic = p.exitLogic;

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    const old = prev[key as keyof ExistingTrade];
    const same =
      value instanceof Date || old instanceof Date
        ? (value as Date | null)?.getTime() === (old as Date | null)?.getTime()
        : value === old;
    if (!same) data[key] = value;
  }
  return Object.keys(data).length > 0 ? (data as Prisma.TradeUpdateInput) : null;
}

export interface Mt5SyncResult {
  positions: number;
  created: number;
  updated: number;
  open: number;
}

/** Upsert the posted positions into the account's trade log. */
export async function ingestMt5Payload(account: Account, payload: Mt5Payload): Promise<Mt5SyncResult> {
  if (account.mt5Login && account.mt5Login !== payload.login) {
    throw new Mt5SyncError(
      `This key belongs to MT5 account ${account.mt5Login}, not ${payload.login}. Attach the EA to that account, or disconnect and reconnect in Moblog.`,
      409,
    );
  }

  const positions = buildPositions(payload);
  const existing = await prisma.trade.findMany({
    where: { accountId: account.id, mt5Ticket: { in: positions.map((p) => p.ticket) } },
    select: EXISTING_SELECT,
  });
  const byTicket = new Map(existing.map((t) => [t.mt5Ticket, t]));

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  let created = 0;
  let updated = 0;
  for (const p of positions) {
    const prev = byTicket.get(p.ticket);
    if (!prev) {
      created++;
      writes.push(
        prisma.trade.create({
          data: {
            accountId: account.id,
            mt5Ticket: p.ticket,
            ...brokerFields(p),
            stopLoss: p.stopLoss,
            takeProfit: p.takeProfit,
            riskAmount: p.riskAmount,
            rr: p.rr,
            exitLogic: p.exitLogic,
          },
        }),
      );
      continue;
    }
    const data = tradeUpdate(prev, p);
    if (data) {
      updated++;
      writes.push(prisma.trade.update({ where: { id: prev.id }, data }));
    }
  }
  writes.push(
    prisma.account.update({
      where: { id: account.id },
      data: { mt5Login: payload.login, mt5Server: payload.server || null, mt5SyncedAt: new Date() },
    }),
  );

  try {
    await prisma.$transaction(writes);
  } catch (error) {
    // Two terminals racing to import the same position.
    if ((error as { code?: string }).code === "P2002") {
      throw new Mt5SyncError("Another sync for this account is running — retrying shortly.", 503);
    }
    throw error;
  }

  return {
    positions: positions.length,
    created,
    updated,
    open: positions.filter((p) => p.closeDate === null).length,
  };
}
