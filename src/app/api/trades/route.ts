import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import type { Direction } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseDirection(value: unknown): Direction {
  return value === "SHORT" ? "SHORT" : "LONG";
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateOrNow(value: unknown): Date {
  if (value === null || value === undefined || value === "") return new Date();
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// GET /api/trades?accountId=...  -> list trades, optionally filtered by account
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const trades = await prisma.trade.findMany({
      where: accountId ? { accountId } : undefined,
      orderBy: { openDate: "desc" },
    });
    return NextResponse.json(trades);
  } catch (error) {
    console.error("GET /api/trades failed:", error);
    return NextResponse.json(
      { error: "Failed to load trades. Is your DATABASE_URL configured?" },
      { status: 500 },
    );
  }
}

// POST /api/trades  -> create a trade
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();

    const accountId = String(body.accountId ?? "").trim();
    if (!accountId) {
      return NextResponse.json({ error: "Account is required." }, { status: 400 });
    }
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const pair = String(body.pair ?? "").trim().toUpperCase();
    if (!pair) {
      return NextResponse.json({ error: "Pair is required." }, { status: 400 });
    }

    const openDate = toDateOrNow(body.openDate);
    const closeDate = toDateOrNull(body.closeDate);

    const pnl = toNumberOrNull(body.pnl) ?? 0;
    const roi = toNumberOrNull(body.roi);
    const rr = toNumberOrNull(body.rr);

    const trade = await prisma.trade.create({
      data: {
        accountId,
        openDate,
        closeDate,
        pair,
        direction: parseDirection(body.direction),
        exitLogic: body.exitLogic ? String(body.exitLogic).trim() : null,
        pnl,
        roi,
        rr,
        entry: toNumberOrNull(body.entry),
        exit: toNumberOrNull(body.exit),
        stopLoss: toNumberOrNull(body.stopLoss),
        takeProfit: toNumberOrNull(body.takeProfit),
        size: toNumberOrNull(body.size),
        riskAmount: toNumberOrNull(body.riskAmount),
        setup: body.setup ? String(body.setup).trim() : null,
        comment: body.comment ? String(body.comment).trim() : null,
        chartUrl: body.chartUrl ? String(body.chartUrl).trim() : null,
      },
    });

    return NextResponse.json(trade, { status: 201 });
  } catch (error) {
    console.error("POST /api/trades failed:", error);
    return NextResponse.json({ error: "Failed to create trade." }, { status: 500 });
  }
}
