import Link from "next/link";
import { and, count, desc, eq, gte, lte, or, sql, SQL } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categoryRules, transactions } from "@/db/schema";
import { formatCategory, formatCents } from "@/lib/format";
import { currentMonth, shortDate } from "@/lib/months";
import { categoryTotals } from "@/lib/insights";
import { categoryColor } from "@/lib/colors";
import { merchantKey } from "@/lib/categories";
import { Card, Empty, Page, Pager } from "@/app/ui";
import { CategoryPicker } from "./category-picker";

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

  const [allAccounts, categoryRows, rows, [{ total, moneyIn, moneyOut }], monthCats, rules] = await Promise.all([
    db.select().from(accounts),
    db.selectDistinct({ category: transactions.category }).from(transactions),
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        name: transactions.name,
        merchantName: transactions.merchantName,
        category: transactions.category,
        plaidCategory: transactions.plaidCategory,
        categoryOverride: transactions.categoryOverride,
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
    db
      .select({
        total: count(),
        moneyIn: sql<number>`coalesce(sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end), 0)`,
        moneyOut: sql<number>`coalesce(sum(case when ${transactions.amount} > 0 then ${transactions.amount} else 0 end), 0)`,
      })
      .from(transactions)
      .where(where),
    // this month's top-8 slot assignment, shared with /spending and the overview
    categoryTotals(currentMonth()),
    db.select({ key: categoryRules.merchantKey, category: categoryRules.category }).from(categoryRules),
  ]);
  const ruleByMerchant = new Map(rules.map((r) => [r.key, r.category]));

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

  const top8 = monthCats
    .filter((c) => c.total > 0)
    .slice(0, 8)
    .map((c) => c.category ?? "UNCATEGORIZED");
  const filtered = Object.keys(baseParams).length > 0;
  const filterHref = (extra: Record<string, string>) =>
    `/transactions?${new URLSearchParams({ ...baseParams, ...extra }).toString()}`;

  return (
    <Page
      wide
      title="Transactions"
      subtitle={
        <>
          {total.toLocaleString()} {filtered ? "matching" : "total"} · {formatCents(moneyIn)} in ·{" "}
          {formatCents(moneyOut)} out
        </>
      }
    >
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex w-full flex-col gap-1 sm:w-auto sm:min-w-56 sm:flex-1">
            <span className="eyebrow">Search</span>
            <input
              name="q"
              type="search"
              placeholder="Merchant or description"
              defaultValue={params.q ?? ""}
              className="field sm:w-full"
            />
          </label>

          <label className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="eyebrow">Account</span>
            <select name="account" defaultValue={params.account ?? ""} className="field">
              <option value="">All accounts</option>
              {allAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.mask ? ` ····${a.mask}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="eyebrow">Category</span>
            <select name="category" defaultValue={params.category ?? ""} className="field">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {formatCategory(c)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-[calc(50%-0.375rem)] flex-col gap-1 sm:w-auto">
            <span className="eyebrow">From</span>
            <input type="date" name="from" defaultValue={params.from ?? ""} className="field" />
          </label>

          <label className="flex w-[calc(50%-0.375rem)] flex-col gap-1 sm:w-auto">
            <span className="eyebrow">To</span>
            <input type="date" name="to" defaultValue={params.to ?? ""} className="field" />
          </label>

          <div className="flex w-full gap-2 sm:w-auto">
            <button type="submit" className="btn btn-primary flex-1 sm:flex-none">
              Apply
            </button>
            {filtered ? (
              <Link href="/transactions" className="btn flex-1 sm:flex-none">
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </Card>

      <Card className="p-0 sm:p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>No matching transactions.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Account</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((tx) => {
                  const isCredit = tx.amount < 0;
                  const picker = (
                    <CategoryPicker
                      id={tx.id}
                      merchant={tx.merchantName ?? tx.name}
                      category={tx.category}
                      plaidCategory={tx.plaidCategory}
                      overridden={tx.categoryOverride !== null}
                      ruleCategory={ruleByMerchant.get(merchantKey(tx.merchantName, tx.name)) ?? null}
                      color={tx.category ? categoryColor(tx.category, top8) : "var(--chart-muted)"}
                      filterHref={tx.category ? filterHref({ category: tx.category }) : null}
                    />
                  );
                  return (
                    <tr key={tx.id} className="hover:bg-fill">
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted">{shortDate(tx.date)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <span className="font-medium">{tx.merchantName ?? tx.name}</span>
                          {tx.pending && (
                            <span className="rounded-full bg-fill-strong px-2 py-0.5 text-[10px] font-medium uppercase text-muted">
                              Pending
                            </span>
                          )}
                        </div>
                        {/* mobile: account + category fold under the name */}
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted sm:hidden">
                          {picker}
                          <span className="truncate">{tx.accountName}</span>
                        </div>
                      </td>
                      <td className="hidden px-4 py-2.5 whitespace-nowrap text-muted sm:table-cell">
                        {tx.accountName}
                        {tx.accountMask ? ` ····${tx.accountMask}` : ""}
                      </td>
                      <td className="hidden px-4 py-2.5 whitespace-nowrap sm:table-cell">
                        {picker}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-medium whitespace-nowrap tabular-nums ${
                          isCredit ? "text-positive" : ""
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
      </Card>

      <Pager page={page} totalPages={totalPages} total={total} noun="transactions" href={pageHref} />
    </Page>
  );
}
