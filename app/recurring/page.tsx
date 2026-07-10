import { and, eq, gt, isNull, ne, notLike, or } from "drizzle-orm";
import { db } from "@/db";
import { recurringRules, transactions } from "@/db/schema";
import { formatCents } from "@/lib/format";
import { cadenceFromGap, detectRecurring, partitionSeries } from "@/lib/recurring";
import { AddRuleForm, RuleActions, SuggestionCard } from "./recurring-form";

export const dynamic = "force-dynamic";

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

  const rules = await db.select().from(recurringRules);

  const { suggestions, nextDates } = partitionSeries(detectRecurring(rows), rules);
  const confirmed = rules
    .filter((r) => r.status === "confirmed")
    .sort((a, b) => b.amount - a.amount);

  const estimatedMonthlyTotal = confirmed.reduce((sum, r) => sum + (r.amount * 30) / r.gapDays, 0);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-16">
        <h1 className="text-2xl font-semibold">Recurring</h1>

        <div>
          <span className="text-sm opacity-60">Estimated monthly total</span>
          <p className="text-2xl font-semibold">{formatCents(Math.round(estimatedMonthlyTotal))}</p>
        </div>

        {suggestions.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Suggestions</h2>
            {suggestions.map((s) => (
              <SuggestionCard
                key={`${s.matchKey}-${s.amount}`}
                suggestion={{
                  matchKey: s.matchKey,
                  merchant: s.merchant,
                  amount: s.amount,
                  cadence: s.cadence,
                  gapDays: s.gapDays,
                  lastDate: s.lastDate,
                  count: s.count,
                }}
              />
            ))}
          </section>
        )}

        {confirmed.length === 0 ? (
          <p className="text-sm opacity-60">
            No confirmed recurring transactions yet. Confirm a suggestion above or add one manually below.
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left opacity-60 dark:border-zinc-800">
                <th className="py-2 font-normal">Name</th>
                <th className="py-2 font-normal">Amount</th>
                <th className="py-2 font-normal">Cadence</th>
                <th className="py-2 font-normal">Last</th>
                <th className="py-2 font-normal">Next expected</th>
                <th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {confirmed.map((r) => {
                const dates = nextDates.get(r.id);
                return (
                  <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="py-2">{r.name}</td>
                    <td className="py-2">{formatCents(r.amount)}</td>
                    <td className="py-2 capitalize">{cadenceFromGap(r.gapDays)}</td>
                    <td className="py-2">{dates?.lastDate ?? "—"}</td>
                    <td className="py-2">{dates?.nextDate}</td>
                    <td className="py-2">
                      <RuleActions
                        rule={{
                          id: r.id,
                          name: r.name,
                          amount: r.amount,
                          gapDays: r.gapDays,
                          anchorDate: r.anchorDate,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Add manually</h2>
          <AddRuleForm />
        </section>
      </main>
    </div>
  );
}
