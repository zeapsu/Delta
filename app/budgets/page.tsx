import { and, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { formatCategory, formatCents } from "@/lib/format";
import { budgetProgress, budgetTone, isSpend } from "@/lib/insights";
import { currentMonth, recentMonths, shortMonthLabel } from "@/lib/months";
import { BudgetForm, DeleteBudgetButton } from "./budget-form";
import { BudgetTrendChart, type BudgetTrendPoint } from "@/app/charts";
import { Card, Empty, Meter, Page, Stat } from "@/app/ui";

export const dynamic = "force-dynamic";

const TREND_MONTHS = 6;

export default async function BudgetsPage() {
  const month = currentMonth();
  const months = recentMonths(TREND_MONTHS);

  const [budgetRows, categoryRows, trendRows] = await Promise.all([
    budgetProgress(month),
    db
      .selectDistinct({ category: transactions.category })
      .from(transactions)
      .where(isSpend),
    // Month-bucketed spend for the trend charts (same sum convention as the
    // progress bars: all transactions, pending included).
    db
      .select({
        category: transactions.category,
        month: sql<string>`substr(${transactions.date}, 1, 7)`,
        total: sql<number>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .where(and(sql`substr(${transactions.date}, 1, 7) >= ${months[0]}`, isSpend))
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

  const categories = categoryRows
    .map((r) => r.category)
    .filter((c): c is string => c !== null)
    .sort();

  const totalBudget = budgetRows.reduce((s, b) => s + b.monthlyAmount, 0);
  const totalSpent = budgetRows.reduce((s, b) => s + b.spent, 0);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();
  const monthPct = (now.getDate() / daysInMonth) * 100;
  const sorted = [...budgetRows].sort((a, b) => b.pct - a.pct);

  return (
    <Page title="Budgets" subtitle="Monthly limits per category, tracked against this month's spending.">
      {budgetRows.length > 0 ? (
        <Card>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <Stat
              size="lg"
              label="Spent of budgeted"
              value={formatCents(totalSpent)}
              sub={`of ${formatCents(totalBudget)} · ${formatCents(Math.max(totalBudget - totalSpent, 0))} left`}
            />
            <Stat
              label="Month elapsed"
              value={`${Math.round(monthPct)}%`}
              sub={`${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
            />
          </div>
          <div className="relative">
            <Meter
              value={totalSpent}
              max={totalBudget}
              tone={budgetTone((totalSpent / totalBudget) * 100)}
              label="Total budget used"
            />
            {/* pace marker: where spending "should" be if spread evenly */}
            <span
              className="absolute -top-1 h-4 w-0.5 rounded bg-muted"
              style={{ left: `${monthPct}%` }}
              title="Even pace"
            />
          </div>
          <p className="text-xs text-muted">The tick marks an even pace through the month.</p>
        </Card>
      ) : null}

      <Card title="Add or update a budget" ask={false}>
        <BudgetForm categories={categories} />
      </Card>

      {budgetRows.length === 0 ? (
        <Card>
          <Empty>No budgets yet. Pick a category above to set your first monthly limit.</Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {sorted.map((b) => {
            const remaining = b.monthlyAmount - b.spent;
            return (
              <Card
                key={b.category}
                title={formatCategory(b.category)}
                action={<DeleteBudgetButton category={b.category} />}
              >
                <div className="flex items-end justify-between gap-3">
                  <Stat
                    label={remaining >= 0 ? "Left this month" : "Over budget"}
                    value={formatCents(Math.abs(remaining))}
                  />
                  <span className="text-right text-xs text-muted tabular-nums">
                    {formatCents(b.net)} / {formatCents(b.monthlyAmount)}
                    <br />
                    {Math.round(b.pct)}% used
                  </span>
                </div>
                <Meter
                  value={b.spent}
                  max={b.monthlyAmount}
                  tone={budgetTone(b.pct)}
                  label={`${formatCategory(b.category)} budget used`}
                />
                <BudgetTrendChart data={trendFor(b.category)} budget={b.monthlyAmount} />
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
