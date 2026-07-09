// Pure forward-fill logic, no DB imports — see lib/networth-check.ts for the self-check.

export type NetWorthRow = {
  day: string;
  net_worth: number;
};

export type NetWorthSeries = {
  days: string[];
  total: NetWorthRow[];
  // Per-account filled values aligned to `days`; null before the account's
  // first snapshot (no back-fill).
  byAccount: Map<string, (number | null)[]>;
};

type AccountDayAdj = { accountId: string; day: string; adj: number };

export function forwardFillNetWorth(rows: AccountDayAdj[]): NetWorthSeries {
  const days = [...new Set(rows.map((r) => r.day))].sort();

  const snapshots = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = snapshots.get(r.accountId);
    if (m) m.set(r.day, r.adj);
    else snapshots.set(r.accountId, new Map([[r.day, r.adj]]));
  }

  const totals = new Map(days.map((d) => [d, 0]));
  const byAccount = new Map<string, (number | null)[]>();
  for (const [accountId, byDay] of snapshots) {
    const filled: (number | null)[] = [];
    let last: number | undefined;
    for (const day of days) {
      if (byDay.has(day)) last = byDay.get(day);
      filled.push(last ?? null);
      if (last !== undefined) totals.set(day, totals.get(day)! + last);
    }
    byAccount.set(accountId, filled);
  }

  return {
    days,
    total: days.map((day) => ({ day, net_worth: totals.get(day)! })),
    byAccount,
  };
}
