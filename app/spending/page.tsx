import Link from "next/link";
import { and, desc, isNull, like, ne, notLike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { formatCategory, formatCents } from "@/lib/format";
import { categoryColor } from "@/lib/colors";
import { CategoryDonut, type DonutSlice } from "@/app/charts";

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
      total: sql<number>`sum(case when ${transactions.pending} = 0 then ${transactions.amount} else 0 end)`,
      pendingTotal: sql<number>`sum(case when ${transactions.pending} = 1 then ${transactions.amount} else 0 end)`,
    })
    .from(transactions)
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
    .orderBy(desc(sql`sum(case when ${transactions.pending} = 0 then ${transactions.amount} else 0 end)`));

  const spending = rows.filter((r) => r.total > 0);
  const grandTotal = spending.reduce((sum, r) => sum + r.total, 0);
  const max = Math.max(...spending.map((r) => r.total), 0);
  const pendingSum = rows.reduce((s, r) => s + Math.max(r.pendingTotal, 0), 0);

  // Donut: top 8 categories + "Other". Slots come from the displayed set in
  // sorted order, so colors are deterministic and distinct within the chart.
  // ponytail: a category can shift color when the month's top-8 changes; a
  // persistent per-category color map is the upgrade if that ever grates.
  const top = spending.slice(0, 8);
  const otherTotal = spending.slice(8).reduce((s, r) => s + r.total, 0);
  const topCategories = top.map((r) => r.category ?? "UNCATEGORIZED");
  const donutData: DonutSlice[] = top.map((r) => ({
    name: formatCategory(r.category),
    value: r.total,
    color: categoryColor(r.category ?? "UNCATEGORIZED", topCategories),
  }));
  if (otherTotal > 0) {
    donutData.push({ name: "Other", value: otherTotal, color: "var(--chart-muted)" });
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-16">
        <div className="flex items-center justify-between">
          <Link href={`/spending?month=${shiftMonth(month, -1)}`}>Prev</Link>
          <h1 className="text-2xl font-semibold">{monthLabel(month)}</h1>
          <Link href={`/spending?month=${shiftMonth(month, 1)}`}>Next</Link>
        </div>

        <div>
          <span className="text-sm opacity-60">Total spending</span>
          <p className="text-2xl font-semibold">{formatCents(grandTotal)}</p>
          {pendingSum > 0 && (
            <p className="text-sm opacity-60">+ {formatCents(pendingSum)} pending</p>
          )}
        </div>

        {spending.length === 0 ? (
          <p className="text-sm opacity-60">No spending this month.</p>
        ) : (
          <>
            <CategoryDonut data={donutData} />
            <div className="flex flex-col gap-3">
            {spending.map((r) => (
              <div key={r.category ?? "null"} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-sm sm:w-32">
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
          </>
        )}
      </main>
    </div>
  );
}
