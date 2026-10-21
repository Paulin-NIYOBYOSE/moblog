import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/serverAuth";
import { hashSyncKey, newSyncKey } from "@/lib/mt5/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function status(id: string) {
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) return null;
  const trades = await prisma.trade.count({ where: { accountId: id, mt5Ticket: { not: null } } });
  return {
    connected: account.mt5KeyHash !== null,
    login: account.mt5Login,
    server: account.mt5Server,
    syncedAt: account.mt5SyncedAt,
    trades,
  };
}

// GET /api/accounts/:id/mt5 -> sync status
export async function GET(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const s = await status(id);
    if (!s) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    return NextResponse.json(s);
  } catch (error) {
    console.error("GET /api/accounts/:id/mt5 failed:", error);
    return NextResponse.json({ error: "Failed to load MT5 sync status." }, { status: 500 });
  }
}

// POST /api/accounts/:id/mt5 -> new connection key (replaces any old one).
// The key is returned once; only its hash is stored.
export async function POST(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const key = newSyncKey();
    const { count } = await prisma.account.updateMany({ where: { id }, data: { mt5KeyHash: hashSyncKey(key) } });
    if (count === 0) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    return NextResponse.json({ key, status: await status(id) });
  } catch (error) {
    console.error("POST /api/accounts/:id/mt5 failed:", error);
    return NextResponse.json({ error: "Failed to create a connection key." }, { status: 500 });
  }
}

// DELETE /api/accounts/:id/mt5 -> disconnect (imported trades are kept)
export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await prisma.account.updateMany({
      where: { id },
      data: { mt5KeyHash: null, mt5Login: null, mt5Server: null, mt5SyncedAt: null },
    });
    const s = await status(id);
    if (!s) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    return NextResponse.json(s);
  } catch (error) {
    console.error("DELETE /api/accounts/:id/mt5 failed:", error);
    return NextResponse.json({ error: "Failed to disconnect MT5." }, { status: 500 });
  }
}
