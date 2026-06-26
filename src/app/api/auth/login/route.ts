import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  checkCredentials,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String(body.email ?? "");
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  if (!checkCredentials(email, password)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const token = await createSessionToken(email.trim().toLowerCase());
  const store = await cookies();
  store.set({ ...sessionCookieOptions(), value: token });

  return NextResponse.json({ success: true });
}
