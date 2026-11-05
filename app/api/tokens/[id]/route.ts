import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/api-tokens";
import { sentByAgent } from "@/lib/agent-config";

// Revoke one agent token (Settings → Agents).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (sentByAgent(req)) return NextResponse.json({ error: "Agents can't manage tokens" }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Bad token id" }, { status: 400 });
  return (await revokeToken(id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "No active token with that id" }, { status: 404 });
}
