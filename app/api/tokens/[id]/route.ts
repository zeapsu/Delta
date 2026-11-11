import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/api-tokens";
import { sentByAgent } from "@/lib/agent-config";

// Revoke one agent token (Settings → Agents).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (sentByAgent(req)) return NextResponse.json({ error: "Agents can't manage tokens" }, { status: 403 });
  // Digits only: Number() would also take "1.0", "0x1" or " 1".
  const raw = (await params).id;
  const id = /^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id)) return NextResponse.json({ error: "Bad token id" }, { status: 400 });
  return (await revokeToken(id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "No active token with that id" }, { status: 404 });
}
