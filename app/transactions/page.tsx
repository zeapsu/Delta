import Link from "next/link";
import { and, count, desc, eq, gte, lte, or, sql, SQL } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { formatCategory, formatCents } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = {
  account?: string;
  category?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: string;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const conditions: SQL[] = [];
  if (params.account) conditions.push(eq(transactions.accountId, Number(params.account)));
  if (params.category) conditions.push(eq(transactions.category, params.category));
  if (params.from) conditions.push(gte(transactions.date, params.from));
  if (params.to) conditions.push(lte(transactions.date, params.to));
  if (params.q) {
    // Escape LIKE wildcards so searching for "%"/"_" matches literally.
    const like_ = `%${params.q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        sql`${transactions.name} LIKE ${like_} ESCAPE '\\'`,
        sql`${transactions.merchantName} LIKE ${like_} ESCAPE '\\'`,
      )!,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [allAccounts, categoryRows, rows, [{ total }]] = await Promise.all([
    db.select().from(accounts),
    db.selectDistinct({ category: transactions.category }).from(transactions),
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        name: transactions.name,
        merchantName: transactions.merchantName,
        category: transactions.category,
        amount: transactions.amount,
        pending: transactions.pending,
        accountName: accounts.name,
        accountMask: accounts.mask,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(where)
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(transactions).where(where),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categories = categoryRows
    .map((r) => r.category)
    .filter((c): c is string => c !== null)
    .sort();

  const baseParams: Record<string, string> = {};
  if (params.account) baseParams.account = params.account;
  if (params.category) baseParams.category = params.category;
  if (params.from) baseParams.from = params.from;
  if (params.to) baseParams.to = params.to;
  if (params.q) baseParams.q = params.q;

  const pageHref = (p: number) =>
    `/transactions?${new URLSearchParams({ ...baseParams, page: String(p) }).toString()}`;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold">Transactions</h1>

        <form
          method="get"
          className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
        >
          <label className="flex w-full flex-col gap-1 text-sm sm:w-auto">
            Account
            <select
              name="account"
              defaultValue={params.account ?? ""}
              className="w-full rounded border px-2 py-2 dark:bg-zinc-900 sm:w-auto sm:py-1"
            >
              <option value="">All accounts</option>
              {allAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.mask ? ` ····${a.mask}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-full flex-col gap-1 text-sm sm:w-auto">
            Category
            <select
              name="category"
              defaultValue={params.category ?? ""}
              className="w-full rounded border px-2 py-2 dark:bg-zinc-900 sm:w-auto sm:py-1"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {formatCategory(c)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-full flex-col gap-1 text-sm sm:w-auto">
            From
            <input
              type="date"
              name="from"
              defaultValue={params.from ?? ""}
              className="w-full rounded border px-2 py-2 dark:bg-zinc-900 sm:w-auto sm:py-1"
            />
          </label>

          <label className="flex w-full flex-col gap-1 text-sm sm:w-auto">
            To
            <input
              type="date"
              name="to"
              defaultValue={params.to ?? ""}
              className="w-full rounded border px-2 py-2 dark:bg-zinc-900 sm:w-auto sm:py-1"
            />
          </label>

          <label className="flex w-full flex-col gap-1 text-sm sm:w-auto">
            Search
            <input
              name="q"
              placeholder="Search"
              defaultValue={params.q ?? ""}
              className="w-full rounded border px-2 py-2 dark:bg-zinc-900 sm:w-auto sm:py-1"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white sm:w-auto sm:py-1.5 dark:bg-white dark:text-black"
          >
            Filter
          </button>
        </form>

        {rows.length === 0 ? (
          <p className="text-sm opacity-60">No matching transactions.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs opacity-60">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {rows.map((tx) => {
                  const isCredit = tx.amount < 0;
                  return (
                    <tr key={tx.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{tx.date}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span>{tx.merchantName ?? tx.name}</span>
                          {tx.pending && (
                            <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium uppercase dark:bg-zinc-800">
                              Pending
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap opacity-60">
                        {tx.accountName}
                        {tx.accountMask ? ` ····${tx.accountMask}` : ""}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap opacity-60">
                        {formatCategory(tx.category)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
                          isCredit ? "text-green-600 dark:text-green-500" : ""
                        }`}
                      >
                        {isCredit
                          ? `+${formatCents(Math.abs(tx.amount))}`
                          : formatCents(tx.amount)}
                      </td>
                    </tr>
                  );
                })}
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
