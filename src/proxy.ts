import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Next.js 16 renamed `middleware` to `proxy` (runs on the Node.js runtime).
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Auth endpoints must always be reachable (login / logout).
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  const isLoginPage = pathname === "/login";

  // Not signed in -> force to /login (remember where they came from).
  if (!session && !isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?from=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Already signed in but visiting /login -> send to dashboard.
  if (session && isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
