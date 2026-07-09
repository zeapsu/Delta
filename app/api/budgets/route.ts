import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { budgets } from "@/db/schema";

const CATEGORY_RE = /^[A-Z_]{1,64}$/;

export async function GET() {
  const rows = await db
    .select({ category: budgets.category, monthlyAmount: budgets.monthlyAmount })
    .from(budgets);
  return NextResponse.json({ budgets: rows });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { category, monthlyAmount } = body as {
    category?: unknown;
    monthlyAmount?: unknown;
  };

  if (typeof category !== "string" || !CATEGORY_RE.test(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (
    typeof monthlyAmount !== "number" ||
    !Number.isInteger(monthlyAmount) ||
    monthlyAmount <= 0 ||
    monthlyAmount > 100_000_000
  ) {
    return NextResponse.json({ error: "Invalid monthlyAmount" }, { status: 400 });
  }

  await db
    .insert(budgets)
    .values({ category, monthlyAmount })
    .onConflictDoUpdate({ target: budgets.category, set: { monthlyAmount } });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { category } = body as { category?: unknown };
  if (typeof category !== "string" || !CATEGORY_RE.test(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const result = await db.delete(budgets).where(eq(budgets.category, category)).returning();
  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
