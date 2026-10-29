import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categoryRules, transactions } from "@/db/schema";
import { isCategory, merchantKey } from "@/lib/categories";

// Relabel a transaction. Body: { id, category, merchant? }.
// category null = back to Plaid's label (or the merchant rule's, if any).
// merchant true = apply to every transaction from this merchant, now and on
// future syncs (with category null it removes that merchant rule instead).
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

  const { id, category, merchant = false } = body as {
    id?: unknown;
    category?: unknown;
    merchant?: unknown;
  };
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (category !== null && !isCategory(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (typeof merchant !== "boolean") {
    return NextResponse.json({ error: "Invalid merchant" }, { status: 400 });
  }

  const [target] = await db
    .select({ name: transactions.name, merchantName: transactions.merchantName })
    .from(transactions)
    .where(eq(transactions.id, id));
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const key = merchantKey(target.merchantName, target.name);

  let updated = 0;
  db.transaction((tx) => {
    if (!merchant) {
      const [rule] = tx
        .select({ category: categoryRules.category })
        .from(categoryRules)
        .where(eq(categoryRules.merchantKey, key))
        .all();
      updated = tx
        .update(transactions)
        .set({
          categoryOverride: category,
          category: category ?? rule?.category ?? sql`${transactions.plaidCategory}`,
        })
        .where(eq(transactions.id, id))
        .run().changes;
      return;
    }

    if (category === null) {
      tx.delete(categoryRules).where(eq(categoryRules.merchantKey, key)).run();
    } else {
      tx.insert(categoryRules)
        .values({ merchantKey: key, category })
        .onConflictDoUpdate({ target: categoryRules.merchantKey, set: { category } })
        .run();
    }
    // Matched in JS: SQLite's lower() only folds ASCII.
    const ids = tx
      .select({ id: transactions.id, name: transactions.name, merchantName: transactions.merchantName })
      .from(transactions)
      .all()
      .filter((t) => merchantKey(t.merchantName, t.name) === key)
      .map((t) => t.id);
    // The merchant-wide choice replaces any one-off relabels for that merchant.
    for (let i = 0; i < ids.length; i += 500) {
      updated += tx
        .update(transactions)
        .set({ categoryOverride: null, category: category ?? sql`${transactions.plaidCategory}` })
        .where(inArray(transactions.id, ids.slice(i, i + 500)))
        .run().changes;
    }
  });

  return NextResponse.json({ ok: true, updated });
}
