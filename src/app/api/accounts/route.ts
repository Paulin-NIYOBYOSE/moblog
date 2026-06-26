import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

async function withAggregates() {
  const accounts = await prisma.account.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: "asc" },
  });

  const [closedSums, counts] = await Promise.all([
    prisma.trade.groupBy({
      by: ["accountId"],
      where: { closeDate: { not: null } },
      _sum: { pnl: true },
    }),
    prisma.trade.groupBy({
      by: ["accountId"],
      _count: { _all: true },
    }),
  ]);

  const pnlMap = new Map(closedSums.map((s) => [s.accountId, s._sum.pnl ?? 0]));
  const countMap = new Map(counts.map((c) => [c.accountId, c._count._all]));

  return accounts.map((a) => {
    const netPnl = pnlMap.get(a.id) ?? 0;
    return {
      ...a,
      netPnl,
      balance: a.startingBalance + netPnl,
      tradeCount: countMap.get(a.id) ?? 0,
    };
  });
}

// GET /api/accounts -> list accounts (auto-creates a default one on first run)
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const count = await prisma.account.count({ where: { isArchived: false } });
    if (count === 0) {
      await prisma.account.create({
        data: { name: "Main Account", currency: "USD", startingBalance: 10000 },
      });
    }
    return NextResponse.json(await withAggregates());
  } catch (error) {
    console.error("GET /api/accounts failed:", error);
    return NextResponse.json(
      { error: "Failed to load accounts. Is your DATABASE_URL configured?" },
      { status: 500 },
    );
  }
}

// POST /api/accounts -> create account
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Account name is required." }, { status: 400 });
    }
    const account = await prisma.account.create({
      data: {
        name,
        currency: String(body.currency ?? "USD").trim().toUpperCase().slice(0, 3),
        startingBalance: Number.isFinite(Number(body.startingBalance))
          ? Number(body.startingBalance)
          : 0,
      },
    });
    return NextResponse.json({ ...account, netPnl: 0, balance: account.startingBalance, tradeCount: 0 }, { status: 201 });
  } catch (error) {
    console.error("POST /api/accounts failed:", error);
    return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
  }
}
