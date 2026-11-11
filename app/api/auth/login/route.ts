import { NextResponse } from "next/server";
import { sessionValue, Throttle, verifyPassword } from "@/lib/login";
import { getLogin, sessionCookie } from "@/lib/login-store";

export const dynamic = "force-dynamic";

const throttle = new Throttle();

// Body: { password }. Sets the 30-day session cookie. Open in proxy.ts.
export async function POST(req: Request) {
  const login = getLogin();
  if (!login) return NextResponse.json({ error: "No password is set" }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (throttle.blocked(ip)) {
    return NextResponse.json({ error: "Too many tries. Wait 15 minutes." }, { status: 429, headers: { "Retry-After": "900" } });
  }
  let password: unknown;
  try {
    password = (await req.json())?.password;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof password !== "string" || !verifyPassword(password, login.hash)) {
    throttle.fail(ip);
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  throttle.clear(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(req, sessionValue(login.secret)));
  return res;
}
