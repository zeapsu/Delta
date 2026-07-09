import { db } from "@/db";
import { accounts, items } from "@/db/schema";
import { DEBT_TYPES, formatCents } from "@/lib/format";
import { getNetWorthData } from "@/lib/networth-data";
import type { NetWorthRow } from "@/lib/networth";
import PlaidButtons from "./plaid-buttons";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [allItems, allAccounts, netWorthHistory] = await Promise.all([
    db.select().from(items),
    db.select().from(accounts),
    getNetWorthData().then((d) => d.total),
  ]);

  const institutions = allItems.map((item) => ({
    id: item.id,
    name: item.institutionName ?? "Unknown institution",
    accounts: allAccounts.filter((a) => a.itemId === item.id),
  }));

  const netWorth = allAccounts.reduce((sum, a) => {
    const balance = a.currentBalance ?? 0;
    return sum + (DEBT_TYPES.has(a.type) ? -balance : balance);
  }, 0);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold">Delta</h1>

        <div className="flex items-end justify-between gap-6">
          <div>
            <span className="text-sm opacity-60">Net worth</span>
            <p className="text-2xl font-semibold">{formatCents(netWorth)}</p>
          </div>
          {netWorthHistory.length > 1 ? (
            <Sparkline rows={netWorthHistory} />
          ) : null}
        </div>

        <PlaidButtons />

        {institutions.length === 0 ? (
          <p className="text-sm opacity-60">No accounts connected.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {institutions.map((inst) => {
              const subtotal = inst.accounts.reduce((sum, a) => {
                const balance = a.currentBalance ?? 0;
                return sum + (DEBT_TYPES.has(a.type) ? -balance : balance);
              }, 0);
              return (
                <div key={inst.id} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-medium">{inst.name}</h2>
                    <span className="text-sm opacity-60">
                      {formatCents(subtotal)}
                    </span>
                  </div>
                  {inst.accounts.length === 0 ? (
                    <p className="text-sm opacity-60">No accounts.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                      {inst.accounts.map((account) => (
                        <li
                          key={account.id}
                          className="flex items-center justify-between gap-4 py-2"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {account.name}
                              {account.mask ? ` ····${account.mask}` : ""}
                            </span>
                            <span className="text-xs opacity-60">
                              {account.subtype ?? account.type}
                            </span>
                          </div>
                          <span className="text-sm font-medium">
                            {formatCents(account.currentBalance)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ponytail: static polyline; swap to NetWorthLine if hover is ever wanted.
function Sparkline({ rows }: { rows: NetWorthRow[] }) {
  const width = 120;
  const height = 36;
  const values = rows.map((r) => r.net_worth);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const points = rows
    .map((r, i) => {
      const x = 2 + (i / (rows.length - 1)) * (width - 4);
      const y = 2 + (height - 4) - ((r.net_worth - min) / (max - min)) * (height - 4);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-9 w-30 shrink-0 opacity-60"
      aria-label="Net worth trend"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
