import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

/** Read and verify the current session from the request cookies. */
export async function getSession(): Promise<{ email: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}
