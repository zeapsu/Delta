import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";

const MAX_NAME_LENGTH = 100;

export async function GET() {
  const rows = await db
    .select({ id: conversations.id, name: conversations.name })
    .from(conversations)
    .orderBy(desc(conversations.createdAt));
  return NextResponse.json({ conversations: rows });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { name } = body as { name?: unknown };
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.length > MAX_NAME_LENGTH
  ) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  const [row] = await db
    .insert(conversations)
    .values({ name: name.trim() })
    .returning({ id: conversations.id, name: conversations.name });

  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { id } = body as { id?: unknown };
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // messages cascade via the FK (foreign_keys pragma is ON).
  const result = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
    .returning();
  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
