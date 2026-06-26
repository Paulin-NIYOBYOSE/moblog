import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import type { Direction } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseDirection(value: unknown): Direction | undefined {
  if (value === "SHORT") return "SHORT";
  if (value === "LONG") return "LONG";
  return undefined;
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

// GET /api/trades/:id
export async function GET(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
  return NextResponse.json(trade);
}

// PUT /api/trades/:id  -> update
export async function PUT(request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.accountId !== undefined) data.accountId = String(body.accountId).trim();
    if (body.pair !== undefined) data.pair = String(body.pair).trim().toUpperCase();
    if (body.openDate !== undefined) {
      const d = new Date(body.openDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid open date." }, { status: 400 });
      }
      data.openDate = d;
    }
    if (body.closeDate !== undefined) data.closeDate = toDateOrNull(body.closeDate);
    const direction = parseDirection(body.direction);
    if (direction) data.direction = direction;
    if (body.exitLogic !== undefined)
      data.exitLogic = body.exitLogic ? String(body.exitLogic).trim() : null;
    if (body.pnl !== undefined) data.pnl = toNumberOrNull(body.pnl) ?? 0;
    if (body.roi !== undefined) data.roi = toNumberOrNull(body.roi);
    if (body.rr !== undefined) data.rr = toNumberOrNull(body.rr);
    if (body.entry !== undefined) data.entry = toNumberOrNull(body.entry);
    if (body.exit !== undefined) data.exit = toNumberOrNull(body.exit);
    if (body.stopLoss !== undefined) data.stopLoss = toNumberOrNull(body.stopLoss);
    if (body.takeProfit !== undefined) data.takeProfit = toNumberOrNull(body.takeProfit);
    if (body.size !== undefined) data.size = toNumberOrNull(body.size);
    if (body.riskAmount !== undefined) data.riskAmount = toNumberOrNull(body.riskAmount);
    if (body.setup !== undefined) data.setup = body.setup ? String(body.setup).trim() : null;
    if (body.comment !== undefined) data.comment = body.comment ? String(body.comment).trim() : null;
    if (body.chartUrl !== undefined) data.chartUrl = body.chartUrl ? String(body.chartUrl).trim() : null;

    const trade = await prisma.trade.update({ where: { id }, data });
    return NextResponse.json(trade);
  } catch (error) {
    console.error("PUT /api/trades/:id failed:", error);
    return NextResponse.json({ error: "Failed to update trade." }, { status: 500 });
  }
}

// DELETE /api/trades/:id
export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await prisma.trade.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/trades/:id failed:", error);
    return NextResponse.json({ error: "Failed to delete trade." }, { status: 500 });
  }
}
