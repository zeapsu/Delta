import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { DEBT_TYPES } from "@/lib/format";
import { forwardFillNetWorth, type NetWorthRow } from "@/lib/networth";

type AccountDayRow = {
  account_id: string;
  account_name: string;
  day: string;
  adj: number;
};

export type NetWorthData = {
  days: string[];
  total: NetWorthRow[];
  // One filled series per account, aligned to `days` (null before first snapshot).
  accounts: { name: string; values: (number | null)[] }[];
};

// Per-account per-day snapshots (latest per day wins, debt balances negated).
// Days are in the saved time zone, like every other date in the app: in UTC an
// evening sync west of Greenwich would land on tomorrow.
// forward-fill across missing days happens in JS (lib/networth.ts) so an
// account's day is carried forward, not dropped.
export async function getNetWorthData(): Promise<NetWorthData> {
  const debtTypes = sql.join(
    [...DEBT_TYPES].map((t) => sql`${t}`),
    sql`, `,
  );
  const accountDays = await db.all<AccountDayRow>(sql`
    SELECT account_id, account_name, day, adj FROM (
      SELECT bs.account_id,
             a.name AS account_name,
             date(bs.snapshot_at / 1000, 'unixepoch', 'localtime') AS day,
             CASE WHEN a.type IN (${debtTypes}) THEN -bs.current_balance
                  ELSE bs.current_balance END AS adj,
             ROW_NUMBER() OVER (PARTITION BY bs.account_id, date(bs.snapshot_at / 1000, 'unixepoch', 'localtime')
                                ORDER BY bs.snapshot_at DESC) AS rn
      FROM balance_snapshots bs JOIN accounts a ON a.id = bs.account_id
    ) WHERE rn = 1 ORDER BY day
  `);

  const names = new Map(accountDays.map((r) => [r.account_id, r.account_name]));
  const { days, total, byAccount } = forwardFillNetWorth(
    accountDays.map((r) => ({ accountId: r.account_id, day: r.day, adj: r.adj })),
  );

  return {
    days,
    total,
    accounts: [...byAccount].map(([id, values]) => ({
      name: names.get(id) ?? id,
      values,
    })),
  };
}
