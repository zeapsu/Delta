// DB side of the web UI login, shared by proxy.ts, the routes and the
// password CLI (scripts/password.ts), so no "server-only" here.
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { LOGIN_KEY, parseStoredLogin, SESSION_COOKIE, SESSION_DAYS, type StoredLogin } from "@/lib/login";

// Web UI login (lib/login.ts). null = no password set, Delta is open.
export function getLogin(): StoredLogin | null {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, LOGIN_KEY)).get();
  return parseStoredLogin(row?.value);
}

export function saveLogin(login: StoredLogin) {
  const json = JSON.stringify(login);
  db.insert(settings)
    .values({ key: LOGIN_KEY, value: json })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: json, updatedAt: sql`(unixepoch('now', 'subsec') * 1000)` },
    })
    .run();
}

export function clearLogin() {
  db.delete(settings).where(eq(settings.key, LOGIN_KEY)).run();
}

// Cookie attributes for the session: HttpOnly, Lax (top-level navigations keep
// it, cross-site POSTs don't), Secure when reached over https (tailscale serve).
export function sessionCookie(req: Request, value: string, maxAgeDays = SESSION_DAYS) {
  const https = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return {
    name: SESSION_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: https,
    path: "/",
    maxAge: maxAgeDays * 86_400,
  };
}
