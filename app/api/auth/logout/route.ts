import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/login-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(req, "", 0));
  return res;
}
