import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "moblog_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    // Fallback only for local dev; production MUST set a strong AUTH_SECRET.
    return new TextEncoder().encode("moblog-dev-insecure-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

export function getAuthEmail(): string {
  return (process.env.AUTH_EMAIL || "admin@moblog.app").trim().toLowerCase();
}

function getAuthPassword(): string {
  return process.env.AUTH_PASSWORD || "moblog";
}

/** Constant-time-ish string comparison to reduce timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function checkCredentials(email: string, password: string): boolean {
  const emailOk = safeEqual(email.trim().toLowerCase(), getAuthEmail());
  const passOk = safeEqual(password, getAuthPassword());
  return emailOk && passOk;
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<{ email: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.email === "string") return { email: payload.email };
    return null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = MAX_AGE_SECONDS) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
