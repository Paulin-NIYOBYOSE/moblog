import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

async function withAggregates() {
  const sessions = await prisma.session.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: "desc" },
  });

  const [closedSums, counts, winCounts] = await Promise.all([
    prisma.backtestTrade.groupBy({
      by: ["sessionId"],
      where: { closeDate: { not: null } },
      _sum: { pnl: true },
    }),
    prisma.backtestTrade.groupBy({
      by: ["sessionId"],
      _count: { _all: true },
    }),
    prisma.backtestTrade.groupBy({
      by: ["sessionId"],
      where: { closeDate: { not: null }, pnl: { gt: 0 } },
      _count: { _all: true },
    }),
  ]);

  const pnlMap = new Map(closedSums.map((s) => [s.sessionId, s._sum.pnl ?? 0]));
  const countMap = new Map(counts.map((c) => [c.sessionId, c._count._all]));
  const winMap = new Map(winCounts.map((w) => [w.sessionId, w._count._all]));

  return sessions.map((s) => {
    const netPnl = pnlMap.get(s.id) ?? 0;
    const tradeCount = countMap.get(s.id) ?? 0;
    const wins = winMap.get(s.id) ?? 0;
    return {
      ...s,
      netPnl,
      balance: s.startingBalance + netPnl,
      tradeCount,
      winRate: tradeCount ? (wins / tradeCount) * 100 : 0,
    };
  });
}

// GET /api/sessions -> list backtesting sessions
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await withAggregates());
  } catch (error) {
    console.error("GET /api/sessions failed:", error);
    return NextResponse.json(
      { error: "Failed to load sessions. Is your DATABASE_URL configured?" },
      { status: 500 },
    );
  }
}

// POST /api/sessions -> create a session
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Session name is required." }, { status: 400 });
    }
    const pair = String(body.pair ?? "").trim().toUpperCase();
    if (!pair) {
      return NextResponse.json({ error: "Pair is required." }, { status: 400 });
    }
    const tags = Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
      : [];

    const session = await prisma.session.create({
      data: {
        name,
        pair,
        currency: String(body.currency ?? "USD").trim().toUpperCase().slice(0, 3),
        startingBalance: Number.isFinite(Number(body.startingBalance))
          ? Number(body.startingBalance)
          : 0,
        strategy: body.strategy ? String(body.strategy).trim() : null,
        tags,
        notes: body.notes ? String(body.notes).trim() : null,
      },
    });
    return NextResponse.json(
      { ...session, netPnl: 0, balance: session.startingBalance, tradeCount: 0, winRate: 0 },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/sessions failed:", error);
    return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
  }
}
