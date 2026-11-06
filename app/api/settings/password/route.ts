import { NextResponse } from "next/server";
import { sentByAgent } from "@/lib/agent-config";
import { checkNewPassword, newLogin, sessionValue, verifyPassword } from "@/lib/login";
import { clearLogin, getLogin, saveLogin, sessionCookie } from "@/lib/login-store";

export const dynamic = "force-dynamic";

// Settings → You → Password. Behind the login once one is set, and changing
// or removing it also needs the current one. Agents are refused.
async function read(req: Request): Promise<{ current?: unknown; password?: unknown } | null> {
  try {
    return (await req.json()) ?? {};
  } catch {
    return null;
  }
}

function refuse(req: Request, body: { current?: unknown } | null) {
  if (sentByAgent(req)) return NextResponse.json({ error: "Agents can't change the password" }, { status: 403 });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const login = getLogin();
  if (login && (typeof body.current !== "string" || !verifyPassword(body.current, login.hash))) {
    return NextResponse.json({ error: "Current password is wrong" }, { status: 403 });
  }
  return null;
}

// Body: { password, current? }. A new secret logs out every other device;
// this one gets a fresh session.
export async function PUT(req: Request) {
  const body = await read(req);
  const refused = refuse(req, body);
  if (refused) return refused;
  const problem = checkNewPassword(body!.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const login = newLogin(body!.password as string);
  saveLogin(login);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(req, sessionValue(login.secret)));
  return res;
}

// Body: { current }. Turns the login off.
export async function DELETE(req: Request) {
  const body = await read(req);
  const refused = refuse(req, body);
  if (refused) return refused;
  clearLogin();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(req, "", 0));
  return res;
}
