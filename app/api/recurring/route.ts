import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recurringRules } from "@/db/schema";
import { isDate } from "@/lib/months";

type Fields = {
  name: string;
  amount: number;
  gapDays: number;
  anchorDate: string;
};

// Shared field validation for POST (create) and PUT (edit). Returns the
// narrowed fields or an error message.
function validateFields(body: Record<string, unknown>): Fields | string {
  const { name, amount, gapDays, anchorDate } = body;

  if (typeof name !== "string" || name.length < 1 || name.length > 200) {
    return "Invalid name";
  }
  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > 100_000_000
  ) {
    return "Invalid amount";
  }
  if (
    typeof gapDays !== "number" ||
    !Number.isInteger(gapDays) ||
    gapDays <= 0 ||
    gapDays > 1000
  ) {
    return "Invalid gapDays";
  }
  if (!isDate(anchorDate)) {
    return "Invalid anchorDate";
  }

  return { name, amount, gapDays, anchorDate };
}

async function parseBody(req: Request): Promise<Record<string, unknown> | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  return body as Record<string, unknown>;
}

export async function GET() {
  const rows = await db
    .select({
      id: recurringRules.id,
      status: recurringRules.status,
      matchKey: recurringRules.matchKey,
      name: recurringRules.name,
      amount: recurringRules.amount,
      gapDays: recurringRules.gapDays,
      anchorDate: recurringRules.anchorDate,
    })
    .from(recurringRules);
  return NextResponse.json({ rules: rows });
}

export async function POST(req: Request) {
  const body = await parseBody(req);
  if (body instanceof NextResponse) return body;

  const { status, matchKey } = body;
  if (status !== "confirmed" && status !== "dismissed") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (matchKey !== undefined && matchKey !== null) {
    if (typeof matchKey !== "string" || matchKey.length < 1 || matchKey.length > 200) {
      return NextResponse.json({ error: "Invalid matchKey" }, { status: 400 });
    }
  }

  const fields = validateFields(body);
  if (typeof fields === "string") {
    return NextResponse.json({ error: fields }, { status: 400 });
  }

  await db.insert(recurringRules).values({ status, matchKey: matchKey ?? null, ...fields });

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const body = await parseBody(req);
  if (body instanceof NextResponse) return body;

  const { id } = body;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const fields = validateFields(body);
  if (typeof fields === "string") {
    return NextResponse.json({ error: fields }, { status: 400 });
  }

  const result = await db
    .update(recurringRules)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(recurringRules.id, id))
    .returning();
  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await parseBody(req);
  if (body instanceof NextResponse) return body;

  const { id } = body;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const result = await db.delete(recurringRules).where(eq(recurringRules.id, id)).returning();
  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
