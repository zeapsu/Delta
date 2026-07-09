import { db } from "@/db";
import { accounts, items } from "@/db/schema";
import PlaidButtons from "./plaid-buttons";

export const dynamic = "force-dynamic";

function formatBalance(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 py-16 px-6">
        <h1 className="text-3xl font-semibold">Delta</h1>

        <PlaidButtons />

        {institutions.length === 0 ? (
          <p className="text-sm opacity-60">No accounts connected.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {institutions.map((inst) => (
              <div key={inst.id} className="rounded-lg border p-4">
                <h2 className="mb-3 text-lg font-medium">{inst.name}</h2>
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
                          {formatBalance(account.currentBalance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
