import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import type { Direction } from "@/lib/types";

export const dynamic = "force-dynamic";

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

function parseDirection(value: unknown): Direction {
  return value === "SHORT" ? "SHORT" : "LONG";
}

function toTags(value: unknown): string[] {
  return Array.isArray(value) ? value.map((t) => String(t).trim()).filter(Boolean) : [];
}

interface RawRow {
  openDate?: unknown;
  closeDate?: unknown;
  pair?: unknown;
  direction?: unknown;
  pnl?: unknown;
  roi?: unknown;
  rr?: unknown;
  entry?: unknown;
  exit?: unknown;
  stopLoss?: unknown;
  takeProfit?: unknown;
  size?: unknown;
  riskAmount?: unknown;
  setup?: unknown;
  tags?: unknown;
  comment?: unknown;
  chartUrl?: unknown;
}

// POST /api/backtest-trades/import  -> { sessionId, trades: RawRow[] }
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

    const rawTrades: RawRow[] = Array.isArray(body.trades) ? body.trades : [];
    if (rawTrades.length === 0) {
      return NextResponse.json({ error: "No trades to import." }, { status: 400 });
    }

    const errors: { row: number; message: string }[] = [];
    const data: Array<{
      sessionId: string;
      openDate: Date;
      closeDate: Date | null;
      pair: string;
      direction: Direction;
      pnl: number;
      roi: number | null;
      rr: number | null;
      entry: number | null;
      exit: number | null;
      stopLoss: number | null;
      takeProfit: number | null;
      size: number | null;
      riskAmount: number | null;
      setup: string | null;
      tags: string[];
      comment: string | null;
      chartUrl: string | null;
    }> = [];

    rawTrades.forEach((row, i) => {
      const openDate = toDateOrNull(row.openDate);
      const pair = String(row.pair ?? "").trim().toUpperCase();
      const pnl = toNumberOrNull(row.pnl);

      if (!openDate) {
        errors.push({ row: i + 1, message: "Missing or invalid openDate." });
        return;
      }
      if (!pair) {
        errors.push({ row: i + 1, message: "Missing pair." });
        return;
      }
      if (pnl === null) {
        errors.push({ row: i + 1, message: "Missing or invalid pnl." });
        return;
      }

      data.push({
        sessionId,
        openDate,
        closeDate: toDateOrNull(row.closeDate),
        pair,
        direction: parseDirection(row.direction),
        pnl,
        roi: toNumberOrNull(row.roi),
        rr: toNumberOrNull(row.rr),
        entry: toNumberOrNull(row.entry),
        exit: toNumberOrNull(row.exit),
        stopLoss: toNumberOrNull(row.stopLoss),
        takeProfit: toNumberOrNull(row.takeProfit),
        size: toNumberOrNull(row.size),
        riskAmount: toNumberOrNull(row.riskAmount),
        setup: row.setup ? String(row.setup).trim() : null,
        tags: toTags(row.tags),
        comment: row.comment ? String(row.comment).trim() : null,
        chartUrl: row.chartUrl ? String(row.chartUrl).trim() : null,
      });
    });

    if (data.length === 0) {
      return NextResponse.json({ created: 0, skipped: rawTrades.length, errors }, { status: 400 });
    }

    const result = await prisma.backtestTrade.createMany({ data });

    return NextResponse.json(
      { created: result.count, skipped: rawTrades.length - result.count, errors },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/backtest-trades/import failed:", error);
    return NextResponse.json({ error: "Failed to import trades." }, { status: 500 });
  }
}
