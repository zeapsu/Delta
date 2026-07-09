import { and, eq, gt, isNull, ne, notLike, or } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { formatCents } from "@/lib/format";
import { detectRecurring, type RecurringSeries } from "@/lib/recurring";

export const dynamic = "force-dynamic";

const MONTHLY_MULTIPLIER: Record<string, (amount: number) => number> = {
  weekly: (a) => (a * 30) / 7,
  biweekly: (a) => (a * 30) / 14,
  monthly: (a) => a,
  quarterly: (a) => a / 3,
  yearly: (a) => a / 12,
};

function monthlyEquivalent(series: RecurringSeries): number {
  const fixed = MONTHLY_MULTIPLIER[series.cadence];
  if (fixed) return fixed(series.amount);
  const match = series.cadence.match(/^every ~(\d+) days$/);
  const n = match ? Number(match[1]) : 30;
  return (series.amount * 30) / n;
}

export default async function RecurringPage() {
  const rows = await db
    .select({
      name: transactions.name,
      merchantName: transactions.merchantName,
      amount: transactions.amount,
      date: transactions.date,
    })
    .from(transactions)
    .where(
      and(
        gt(transactions.amount, 0),
        eq(transactions.pending, false),
        or(
          isNull(transactions.category),
          and(
            notLike(transactions.category, "TRANSFER%"),
            ne(transactions.category, "INCOME"),
          ),
        ),
      ),
    );

  const series = detectRecurring(rows);

  const estimatedMonthlyTotal = series.reduce((sum, s) => sum + monthlyEquivalent(s), 0);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 py-16 px-6">
        <h1 className="text-2xl font-semibold">Recurring</h1>

        <div>
          <span className="text-sm opacity-60">Estimated monthly total</span>
          <p className="text-2xl font-semibold">{formatCents(Math.round(estimatedMonthlyTotal))}</p>
        </div>

        {series.length === 0 ? (
          <p className="text-sm opacity-60">No recurring transactions detected yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left opacity-60 dark:border-zinc-800">
                <th className="py-2 font-normal">Merchant</th>
                <th className="py-2 font-normal">Amount</th>
                <th className="py-2 font-normal">Cadence</th>
                <th className="py-2 font-normal">Last</th>
                <th className="py-2 font-normal">Next expected</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={`${s.merchant}-${s.lastDate}`} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2">{s.merchant}</td>
                  <td className="py-2">{formatCents(s.amount)}</td>
                  <td className="py-2 capitalize">{s.cadence}</td>
                  <td className="py-2">{s.lastDate}</td>
                  <td className="py-2">{s.nextDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
