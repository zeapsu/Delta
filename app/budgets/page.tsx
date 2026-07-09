import { like, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgets, transactions } from "@/db/schema";
import { formatCategory, formatCents } from "@/lib/format";
import { BudgetForm, DeleteBudgetButton } from "./budget-form";

export const dynamic = "force-dynamic";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function BudgetsPage() {
  const month = currentMonth();

  const [budgetRows, spendRows, categoryRows] = await Promise.all([
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
    db.selectDistinct({ category: transactions.category }).from(transactions),
  ]);

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
      <main className="flex w-full max-w-3xl flex-col gap-8 py-16 px-6">
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
                  <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className={`h-3 rounded ${color}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
