import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { accounts, investmentTransactions } from "@/db/schema";
import { dateParam, intParam, readRoute } from "@/lib/api-params";

export const dynamic = "force-dynamic";

// Investment activity (buys/sells/dividends/fees), newest first. Never spend.
export const GET = readRoute(async (sp) => {
  const conditions: SQL[] = [];
  const from = dateParam(sp, "from");
  const to = dateParam(sp, "to");
  if (from) conditions.push(gte(investmentTransactions.date, from));
  if (to) conditions.push(lte(investmentTransactions.date, to));
  const accountId = intParam(sp, "account_id", { min: 1, max: Number.MAX_SAFE_INTEGER });
  if (accountId !== undefined) conditions.push(eq(investmentTransactions.accountId, accountId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = intParam(sp, "limit", { min: 1, max: 500, fallback: 100 })!;
  const offset = intParam(sp, "offset", { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 })!;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: investmentTransactions.id,
        date: investmentTransactions.date,
        name: investmentTransactions.name,
        type: investmentTransactions.type,
        subtype: investmentTransactions.subtype,
        securityName: investmentTransactions.securityName,
        tickerSymbol: investmentTransactions.tickerSymbol,
        quantity: investmentTransactions.quantity,
        price: investmentTransactions.price,
        amount: investmentTransactions.amount,
        fees: investmentTransactions.fees,
        currency: investmentTransactions.currency,
        accountId: investmentTransactions.accountId,
        accountName: accounts.name,
      })
      .from(investmentTransactions)
      .innerJoin(accounts, eq(investmentTransactions.accountId, accounts.id))
      .where(where)
      .orderBy(desc(investmentTransactions.date), desc(investmentTransactions.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(investmentTransactions).where(where),
  ]);
  const next = offset + rows.length;
  return { transactions: rows, total, nextOffset: next < total ? next : null };
});
