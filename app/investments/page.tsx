import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, investmentTransactions } from "@/db/schema";
import { formatCents } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

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
        accountName: accounts.name,
      })
      .from(investmentTransactions)
      .innerJoin(accounts, eq(investmentTransactions.accountId, accounts.id))
      .orderBy(desc(investmentTransactions.date), desc(investmentTransactions.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(investmentTransactions),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/investments?page=${p}`;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold">Investments</h1>

        {rows.length === 0 ? (
          <p className="text-sm opacity-60">No investment activity synced yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs opacity-60">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Security</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Fees</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {rows.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{tx.date}</td>
                    <td className="px-3 py-2">{tx.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap opacity-60">
                      {tx.subtype && tx.subtype !== tx.type
                        ? `${tx.type} · ${tx.subtype}`
                        : tx.type}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {tx.securityName
                        ? `${tx.securityName}${tx.tickerSymbol ? ` (${tx.tickerSymbol})` : ""}`
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {tx.quantity ?? ""}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {tx.price !== null
                        ? `$${tx.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {tx.fees !== null ? formatCents(tx.fees) : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {formatCents(tx.amount)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap opacity-60">
                      {tx.accountName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="opacity-60">
            Page {page} of {totalPages} ({total} transactions)
          </span>
          <div className="flex gap-3">
            {page > 1 && <Link href={pageHref(page - 1)}>Prev</Link>}
            {page < totalPages && <Link href={pageHref(page + 1)}>Next</Link>}
          </div>
        </div>
      </main>
    </div>
  );
}
