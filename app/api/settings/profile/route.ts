import { NextResponse } from "next/server";
import { parseProfileInput } from "@/lib/profile";
import { getProfile, saveProfile } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { name, timeZone, effectiveTimeZone } = getProfile();
  return NextResponse.json({ name, timeZone, effectiveTimeZone });
}

// Body: { name?, timeZone? }: the greeting's name and the time zone dates use.
export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseProfileInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  saveProfile(parsed.value);
  const { name, timeZone, effectiveTimeZone } = getProfile();
  return NextResponse.json({ ok: true, name, timeZone, effectiveTimeZone });
}
