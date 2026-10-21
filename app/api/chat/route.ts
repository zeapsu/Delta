import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { allowed } from "@/lib/tailnet";

const MAX_MESSAGE_LENGTH = 4000;

// No agent backend: the Hermes bridge (#48) was removed when Hermes was
// retired. Until #58 lands a replacement, every turn gets this reply. The
// browser stream stays NDJSON ({"t":"text","v"} frames) so the chat UI and
// transcripts keep working unchanged.
const NO_BACKEND =
  "[chat unavailable: no agent backend is configured — see zeapsu/Delta#58]";

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

  const { message, conversationId } = body as {
    message?: unknown;
    conversationId?: unknown;
  };
  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  if (
    typeof conversationId !== "number" ||
    !Number.isInteger(conversationId) ||
    conversationId <= 0
  ) {
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
  }
  const known = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (known.length === 0) {
    return NextResponse.json({ error: "Unknown conversation" }, { status: 404 });
  }

  await db.insert(messages).values({ conversationId, role: "user", text: message });
  await db
    .insert(messages)
    .values({ conversationId, role: "assistant", text: NO_BACKEND });

  return new Response(JSON.stringify({ t: "text", v: NO_BACKEND }) + "\n", {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
