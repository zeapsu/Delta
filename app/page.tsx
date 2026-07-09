import { db } from "@/db";
import { accounts, items } from "@/db/schema";
import { formatCents } from "@/lib/format";
import PlaidButtons from "./plaid-buttons";

export const dynamic = "force-dynamic";

const DEBT_TYPES = new Set(["credit", "loan"]);

export default async function Home() {
  const [allItems, allAccounts] = await Promise.all([
    db.select().from(items),
    db.select().from(accounts),
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
      <main className="flex w-full max-w-3xl flex-col gap-8 py-16 px-6">
        <h1 className="text-3xl font-semibold">Delta</h1>

        <div>
          <span className="text-sm opacity-60">Net worth</span>
          <p className="text-2xl font-semibold">{formatCents(netWorth)}</p>
        </div>

        <PlaidButtons />

        {institutions.length === 0 ? (
          <p className="text-sm opacity-60">No accounts connected.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {institutions.map((inst) => {
              const subtotal = inst.accounts.reduce(
                (sum, a) => sum + (a.currentBalance ?? 0),
                0,
              );
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
