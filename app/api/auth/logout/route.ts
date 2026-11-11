import { NextResponse, type NextRequest } from "next/server";
import { newSecret, SESSION_COOKIE, validSession } from "@/lib/login";
import { getLogin, saveLogin, sessionCookie } from "@/lib/login-store";

export const dynamic = "force-dynamic";

// Clearing the cookie only forgets it in this browser; a copy would stay good
// for the rest of its 30 days. So logging out also rotates the signing secret,
// which ends every session on every device. This route is open in proxy.ts,
// hence the check: only a logged-in request may do that.
export async function POST(req: NextRequest) {
  const login = getLogin();
  if (login && validSession(login.secret, req.cookies.get(SESSION_COOKIE)?.value)) {
    saveLogin({ ...login, secret: newSecret() });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(req, "", 0));
  return res;
}
