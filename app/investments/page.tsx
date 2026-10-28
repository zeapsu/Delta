import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, investmentTransactions } from "@/db/schema";
import { formatCents } from "@/lib/format";
import { shortDate } from "@/lib/months";
import { Card, Empty, Page, Pager, Stat } from "@/app/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const [rows, [{ total }], byType] = await Promise.all([
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
    db
      .select({
        type: investmentTransactions.type,
        n: count(),
        amount: sql<number>`sum(${investmentTransactions.amount})`,
        fees: sql<number>`coalesce(sum(${investmentTransactions.fees}), 0)`,
      })
      .from(investmentTransactions)
      .groupBy(investmentTransactions.type),
  ]);

  // Plaid sign convention: positive = money out (buys), negative = money in.
  const t = (type: string) => byType.find((r) => r.type === type);
  const totalFees = byType.reduce((s, r) => s + r.fees, 0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/investments?page=${p}`;

  return (
    <Page wide title="Investments" subtitle="Buys, sells, dividends, and fees from your brokerage accounts.">
      {byType.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
          <Card>
            <Stat label="Bought" value={formatCents(Math.abs(t("buy")?.amount ?? 0))} sub={`${t("buy")?.n ?? 0} trades`} />
          </Card>
          <Card>
            <Stat label="Sold" value={formatCents(Math.abs(t("sell")?.amount ?? 0))} sub={`${t("sell")?.n ?? 0} trades`} />
          </Card>
          <Card>
            <Stat label="Cash activity" value={formatCents(-(t("cash")?.amount ?? 0))} sub="Dividends, interest, contributions" />
          </Card>
          <Card>
            <Stat label="Fees" value={formatCents(totalFees)} sub="All time" />
          </Card>
        </div>
      ) : null}

      <Card className="p-0 sm:p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>No investment activity synced yet.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Security</th>
                  <th className="px-4 py-3 text-right font-medium">Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 text-right font-medium">Fees</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((tx) => (
                  <tr key={tx.id} className="hover:bg-fill">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">{shortDate(tx.date)}</td>
                    <td className="px-4 py-2.5">{tx.name}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="rounded-full bg-fill px-2.5 py-1 text-xs capitalize">
                        {tx.subtype && tx.subtype !== tx.type
                          ? `${tx.type} · ${tx.subtype}`
                          : tx.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {tx.securityName ? (
                        <>
                          {tx.tickerSymbol ? (
                            <span className="mr-1.5 font-mono text-xs font-semibold">{tx.tickerSymbol}</span>
                          ) : null}
                          <span className="text-muted">{tx.securityName}</span>
                        </>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {tx.quantity ?? ""}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {tx.price !== null
                        ? `$${tx.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums text-muted">
                      {tx.fees !== null ? formatCents(tx.fees) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">
                      {formatCents(tx.amount)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                      {tx.accountName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pager page={page} totalPages={totalPages} total={total} noun="transactions" href={pageHref} />
    </Page>
  );
}
