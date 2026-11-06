import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, validSession } from "@/lib/login";
import { getLogin } from "@/lib/login-store";

// For server components: is a password set, and does this browser have a
// session? proxy.ts already keeps locked-out browsers on /login.
export async function loginStatus(): Promise<{ enabled: boolean; signedIn: boolean }> {
  const login = getLogin();
  if (!login) return { enabled: false, signedIn: false };
  const jar = await cookies();
  return { enabled: true, signedIn: validSession(login.secret, jar.get(SESSION_COOKIE)?.value) };
}
