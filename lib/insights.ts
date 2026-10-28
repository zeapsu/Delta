import "server-only";
import { and, desc, eq, gt, gte, isNull, like, lte, ne, notLike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgets, recurringRules, transactions } from "@/db/schema";
import { cadenceFromGap, detectRecurring, partitionSeries } from "@/lib/recurring";

// Spend = everything except moving money between own accounts, income,
// loan disbursements and credit card payments (same rule as the
// spending/recurring views). A card payment settles purchases already
// counted on the card, so counting it too would double the spend; the card
// side of it sometimes arrives as LOAN_DISBURSEMENTS (e.g. Chase "Payment
// Thank You"), which would otherwise subtract from spend. Real loan payments
// (student, auto, mortgage) stay in. Refunds net against spend.
export const CARD_PAYMENT = "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";
export const isSpend = and(
  or(
    isNull(transactions.category),
    and(
      notLike(transactions.category, "TRANSFER%"),
      ne(transactions.category, "INCOME"),
      ne(transactions.category, "LOAN_DISBURSEMENTS"),
    ),
  ),
  or(isNull(transactions.categoryDetailed), ne(transactions.categoryDetailed, CARD_PAYMENT)),
)!;

const month = sql<string>`substr(${transactions.date}, 1, 7)`;

export type CashFlowMonth = { month: string; income: number; spending: number };

// Posted income vs spend per month, oldest first, zero-filled.
export async function monthlyCashFlow(months: string[]): Promise<CashFlowMonth[]> {
  const rows = await db
    .select({
      month,
      income: sql<number>`coalesce(sum(case when ${transactions.category} = 'INCOME' then -${transactions.amount} else 0 end), 0)`,
      spending: sql<number>`coalesce(sum(case when ${isSpend} then ${transactions.amount} else 0 end), 0)`,
    })
    .from(transactions)
    .where(and(eq(transactions.pending, false), gte(month, months[0])))
    .groupBy(month);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((m) => ({
    month: m,
    income: Math.max(byMonth.get(m)?.income ?? 0, 0),
    spending: Math.max(byMonth.get(m)?.spending ?? 0, 0),
  }));
}

// Posted spend in `m` up to and including day-of-month `day` — for an
// apples-to-apples "this month so far vs last month so far".
export async function spendThroughDay(m: string, day: number): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.pending, false),
        isSpend,
        like(transactions.date, `${m}-%`),
        lte(transactions.date, `${m}-${String(day).padStart(2, "0")}`),
      ),
    );
  return total;
}

export type CategoryTotal = { category: string | null; total: number; pendingTotal: number };

export async function categoryTotals(m: string): Promise<CategoryTotal[]> {
  const posted = sql<number>`sum(case when ${transactions.pending} = 0 then ${transactions.amount} else 0 end)`;
  return db
    .select({
      category: transactions.category,
      total: posted,
      pendingTotal: sql<number>`sum(case when ${transactions.pending} = 1 then ${transactions.amount} else 0 end)`,
    })
    .from(transactions)
    .where(and(like(transactions.date, `${m}-%`), isSpend))
    .groupBy(transactions.category)
    .orderBy(desc(posted));
}

export type UpcomingCharge = {
  id: number;
  name: string;
  amount: number;
  gapDays: number;
  anchorDate: string;
  cadence: string;
  lastDate?: string;
  nextDate?: string;
};

// The /recurring pipeline: detector suggestions + user-reviewed rules.
// Confirmed rules are the truth; suggestions are unreviewed candidates.
export async function recurringOverview() {
  const rows = await db
    .select({
      name: transactions.name,
      merchantName: transactions.merchantName,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .where(and(gt(transactions.amount, 0), eq(transactions.pending, false), isSpend));

  const rules = await db.select().from(recurringRules);
  const { suggestions, nextDates } = partitionSeries(detectRecurring(rows), rules);
  const confirmed: UpcomingCharge[] = rules
    .filter((r) => r.status === "confirmed")
    .map((r) => ({
      id: r.id,
      name: r.name,
      amount: r.amount,
      gapDays: r.gapDays,
      anchorDate: r.anchorDate,
      cadence: cadenceFromGap(r.gapDays),
      ...nextDates.get(r.id),
    }))
    .sort((a, b) => b.amount - a.amount);
  const monthlyEstimate = Math.round(
    confirmed.reduce((sum, r) => sum + (r.amount * 30) / r.gapDays, 0),
  );
  return { suggestions, confirmed, monthlyEstimate };
}

export type BudgetProgress = {
  category: string;
  monthlyAmount: number;
  net: number; // can be negative after refunds
  spent: number; // net clamped at 0
  pct: number;
};

// This month's spend per budgeted category (pending included, refunds net).
export async function budgetProgress(m: string): Promise<BudgetProgress[]> {
  const [budgetRows, spendRows] = await Promise.all([
    db.select({ category: budgets.category, monthlyAmount: budgets.monthlyAmount }).from(budgets),
    db
      .select({ category: transactions.category, total: sql<number>`sum(${transactions.amount})` })
      .from(transactions)
      .where(and(like(transactions.date, `${m}-%`), isSpend))
      .groupBy(transactions.category),
  ]);
  const spent = new Map(spendRows.map((r) => [r.category, r.total]));
  return budgetRows.map((b) => {
    const net = spent.get(b.category) ?? 0;
    const s = Math.max(net, 0);
    return { ...b, net, spent: s, pct: (s / b.monthlyAmount) * 100 };
  });
}

export function budgetTone(pct: number): "positive" | "warning" | "negative" {
  return pct > 100 ? "negative" : pct >= 80 ? "warning" : "positive";
}
