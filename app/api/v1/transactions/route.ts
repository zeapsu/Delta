import { and, count, desc, eq, gte, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { dateParam, intParam, ParamError, readRoute } from "@/lib/api-params";
import { isMonth } from "@/lib/months";

export const dynamic = "force-dynamic";

// Filters mirror the /transactions page. category=UNCATEGORIZED matches null.
// Date filters and ordering use the posted date; authorizedDate (when the
// purchase happened, null if the bank doesn't say) is returned alongside.
export const GET = readRoute(async (sp) => {
  const conditions: SQL[] = [];
  const from = dateParam(sp, "from");
  const to = dateParam(sp, "to");
  if (from) conditions.push(gte(transactions.date, from));
  if (to) conditions.push(lte(transactions.date, to));

  const month = sp.get("month");
  if (month !== null) {
    if (!isMonth(month)) throw new ParamError("month must be YYYY-MM");
    conditions.push(like(transactions.date, `${month}-%`));
  }
  const accountId = intParam(sp, "account_id", { min: 1, max: Number.MAX_SAFE_INTEGER });
  if (accountId !== undefined) conditions.push(eq(transactions.accountId, accountId));

  const category = sp.get("category");
  if (category !== null) {
    conditions.push(
      category === "UNCATEGORIZED" ? isNull(transactions.category) : eq(transactions.category, category),
    );
  }
  const pending = sp.get("pending");
  if (pending !== null) {
    if (pending !== "true" && pending !== "false") throw new ParamError("pending must be true or false");
    conditions.push(eq(transactions.pending, pending === "true"));
  }
  const q = sp.get("q");
  if (q) {
    // Escape LIKE wildcards so searching for "%"/"_" matches literally.
    const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        sql`${transactions.name} LIKE ${pattern} ESCAPE '\\'`,
        sql`${transactions.merchantName} LIKE ${pattern} ESCAPE '\\'`,
      )!,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = intParam(sp, "limit", { min: 1, max: 500, fallback: 100 })!;
  const offset = intParam(sp, "offset", { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 })!;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        authorizedDate: transactions.authorizedDate,
        name: transactions.name,
        merchantName: transactions.merchantName,
        category: transactions.category,
        categoryDetailed: transactions.categoryDetailed,
        amount: transactions.amount,
        pending: transactions.pending,
        accountId: transactions.accountId,
        accountName: accounts.name,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(where)
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(transactions).where(where),
  ]);
  const next = offset + rows.length;
  return { transactions: rows, total, nextOffset: next < total ? next : null };
});
