import { NextResponse } from "next/server";
import { activeTurns, allowed } from "@/lib/tailnet";

// Explicit stop for an in-flight bridge turn (#55). Needed because client
// disconnect intentionally no longer interrupts (#54).
export async function POST(req: Request) {
  if (!allowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { conversationId } = body as { conversationId?: unknown };
  if (
    typeof conversationId !== "number" ||
    !Number.isInteger(conversationId) ||
    conversationId <= 0
  ) {
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  const stop = activeTurns.get(conversationId);
  if (!stop) {
    return NextResponse.json({ error: "No active turn" }, { status: 404 });
  }
  stop();
  return NextResponse.json({ ok: true });
}
