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

function toTags(value: unknown): string[] {
  return Array.isArray(value) ? value.map((t) => String(t).trim()).filter(Boolean) : [];
}

// GET /api/backtest-trades?sessionId=...  -> list, optionally filtered by session
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const trades = await prisma.backtestTrade.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { openDate: "desc" },
    });
    return NextResponse.json(trades);
  } catch (error) {
    console.error("GET /api/backtest-trades failed:", error);
    return NextResponse.json({ error: "Failed to load trades." }, { status: 500 });
  }
}

// POST /api/backtest-trades  -> create a single trade
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();

    const sessionId = String(body.sessionId ?? "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "Session is required." }, { status: 400 });
    }
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const pair = String(body.pair ?? "").trim().toUpperCase();
    if (!pair) {
      return NextResponse.json({ error: "Pair is required." }, { status: 400 });
    }

    const trade = await prisma.backtestTrade.create({
      data: {
        sessionId,
        openDate: toDateOrNow(body.openDate),
        closeDate: toDateOrNull(body.closeDate),
        pair,
        direction: parseDirection(body.direction),
        exitLogic: body.exitLogic ? String(body.exitLogic).trim() : null,
        pnl: toNumberOrNull(body.pnl) ?? 0,
        roi: toNumberOrNull(body.roi),
        rr: toNumberOrNull(body.rr),
        entry: toNumberOrNull(body.entry),
        exit: toNumberOrNull(body.exit),
        stopLoss: toNumberOrNull(body.stopLoss),
        takeProfit: toNumberOrNull(body.takeProfit),
        size: toNumberOrNull(body.size),
        riskAmount: toNumberOrNull(body.riskAmount),
        setup: body.setup ? String(body.setup).trim() : null,
        tags: toTags(body.tags),
        comment: body.comment ? String(body.comment).trim() : null,
        chartUrl: body.chartUrl ? String(body.chartUrl).trim() : null,
      },
    });

    return NextResponse.json(trade, { status: 201 });
  } catch (error) {
    console.error("POST /api/backtest-trades failed:", error);
    return NextResponse.json({ error: "Failed to create trade." }, { status: 500 });
  }
}
