import { and, like, ne, notLike, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgets, transactions } from "@/db/schema";
import { formatCategory, formatCents } from "@/lib/format";
import { BudgetForm, DeleteBudgetButton } from "./budget-form";
import { BudgetTrendChart, type BudgetTrendPoint } from "@/app/charts";

export const dynamic = "force-dynamic";

const TREND_MONTHS = 6;

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Last N months as yyyy-mm, oldest first, ending at the current month.
function recentMonths(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

function shortMonthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year, mon - 1, 1).toLocaleString("default", { month: "short" });
}

export default async function BudgetsPage() {
  const month = currentMonth();
  const months = recentMonths(TREND_MONTHS);

  const [budgetRows, spendRows, categoryRows, trendRows] = await Promise.all([
    db
      .select({ category: budgets.category, monthlyAmount: budgets.monthlyAmount })
      .from(budgets),
    db
      .select({
        category: transactions.category,
        total: sql<number>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .where(like(transactions.date, `${month}-%`))
      .groupBy(transactions.category),
    db
      .selectDistinct({ category: transactions.category })
      .from(transactions)
      .where(
        and(
          notLike(transactions.category, "TRANSFER%"),
          ne(transactions.category, "INCOME"),
        ),
      ),
    // Month-bucketed spend for the trend charts (same sum convention as the
    // progress bars above: all transactions, pending included).
    db
      .select({
        category: transactions.category,
        month: sql<string>`substr(${transactions.date}, 1, 7)`,
        total: sql<number>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .where(sql`substr(${transactions.date}, 1, 7) >= ${months[0]}`)
      .groupBy(transactions.category, sql`substr(${transactions.date}, 1, 7)`),
  ]);

  // category -> month -> spent
  const trendByCategory = new Map<string, Map<string, number>>();
  for (const r of trendRows) {
    if (r.category === null) continue;
    const m = trendByCategory.get(r.category) ?? new Map<string, number>();
    m.set(r.month, r.total);
    trendByCategory.set(r.category, m);
  }
  const trendFor = (category: string): BudgetTrendPoint[] =>
    months.map((m) => ({
      month: shortMonthLabel(m),
      spent: Math.max(trendByCategory.get(category)?.get(m) ?? 0, 0),
    }));

  const spentByCategory = new Map(
    spendRows
      .filter((r): r is { category: string; total: number } => r.category !== null)
      .map((r) => [r.category, r.total]),
  );

  const categories = categoryRows
    .map((r) => r.category)
    .filter((c): c is string => c !== null);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-16">
        <h1 className="text-2xl font-semibold">Budgets</h1>

        <BudgetForm categories={categories} />

        {budgetRows.length === 0 ? (
          <p className="text-sm opacity-60">No budgets yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {budgetRows.map((b) => {
              const net = spentByCategory.get(b.category) ?? 0;
              const spent = Math.max(net, 0);
              const pct = (spent / b.monthlyAmount) * 100;
              const color =
                pct > 100 ? "bg-red-600" : pct >= 80 ? "bg-amber-500" : "bg-green-600";
              return (
                <div key={b.category} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {formatCategory(b.category)}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm opacity-60">
                        {formatCents(net)} / {formatCents(b.monthlyAmount)}
                      </span>
                      <DeleteBudgetButton category={b.category} />
                    </div>
                  </div>
                  <div
                    className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800"
                    role="progressbar"
                    aria-label={`${formatCategory(b.category)} budget used`}
                    aria-valuenow={Math.round(pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`h-3 rounded ${color}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <BudgetTrendChart data={trendFor(b.category)} budget={b.monthlyAmount} />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
