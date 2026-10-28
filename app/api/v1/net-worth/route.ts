import { db } from "@/db";
import { accounts } from "@/db/schema";
import { dateParam, readRoute } from "@/lib/api-params";
import { DEBT_TYPES } from "@/lib/format";
import { getNetWorthData } from "@/lib/networth-data";

export const dynamic = "force-dynamic";

// current = the dashboard headline (live balances, debts negated). history is
// daily, forward-filled per account like the /net-worth chart, so a day where
// one account didn't sync doesn't dip.
export const GET = readRoute(async (sp) => {
  const from = dateParam(sp, "from");
  const [rows, { total }] = await Promise.all([
    db.select({ type: accounts.type, balance: accounts.currentBalance }).from(accounts),
    getNetWorthData(),
  ]);
  const current = rows.reduce(
    (sum, a) => (a.balance === null ? sum : sum + (DEBT_TYPES.has(a.type) ? -a.balance : a.balance)),
    0,
  );
  return {
    current,
    history: total
      .filter((r) => !from || r.day >= from)
      .map((r) => ({ day: r.day, netWorth: r.net_worth })),
  };
});
