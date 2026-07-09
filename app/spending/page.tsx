import Link from "next/link";
import { and, desc, isNull, like, ne, notLike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { formatCategory, formatCents } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = {
  month?: string;
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(year, mon - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year, mon - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // Guard covers the heading, the SQL LIKE, and the prev/next links.
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth();

  const rows = await db
    .select({
      category: transactions.category,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    // ponytail: pending transactions counted as committed spend; they can
    // shift/disappear as Plaid finalizes them, so this month's bars may wobble.
    .where(
      and(
        like(transactions.date, `${month}-%`),
        or(
          isNull(transactions.category),
          and(
            notLike(transactions.category, "TRANSFER%"),
            ne(transactions.category, "INCOME"),
          ),
        ),
      ),
    )
    .groupBy(transactions.category)
    .orderBy(desc(sql`sum(${transactions.amount})`));

  const spending = rows.filter((r) => r.total > 0);
  const grandTotal = spending.reduce((sum, r) => sum + r.total, 0);
  const max = Math.max(...spending.map((r) => r.total), 0);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 py-16 px-6">
        <div className="flex items-center justify-between">
          <Link href={`/spending?month=${shiftMonth(month, -1)}`}>Prev</Link>
          <h1 className="text-2xl font-semibold">{monthLabel(month)}</h1>
          <Link href={`/spending?month=${shiftMonth(month, 1)}`}>Next</Link>
        </div>

        <div>
          <span className="text-sm opacity-60">Total spending</span>
          <p className="text-2xl font-semibold">{formatCents(grandTotal)}</p>
        </div>

        {spending.length === 0 ? (
          <p className="text-sm opacity-60">No spending this month.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {spending.map((r) => (
              <div key={r.category ?? "null"} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm">
                  {formatCategory(r.category)}
                </span>
                <div
                  className="h-4 flex-1 rounded bg-zinc-200 dark:bg-zinc-800"
                  role="progressbar"
                  aria-label={`${formatCategory(r.category)} spending`}
                  aria-valuenow={r.total}
                  aria-valuemin={0}
                  aria-valuemax={max}
                >
                  <div
                    className="h-4 rounded bg-zinc-900 dark:bg-white"
                    style={{ width: `${(r.total / max) * 100}%` }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-sm font-medium">
                  {formatCents(r.total)}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
