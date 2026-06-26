import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  // Expire the cookie immediately.
  store.set({ ...sessionCookieOptions(0), value: "" });
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ success: true });
}
