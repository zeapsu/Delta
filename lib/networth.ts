// Pure forward-fill logic, no DB imports — see lib/networth-check.ts for the self-check.

export type NetWorthRow = {
  day: string;
  net_worth: number;
};

type AccountDayAdj = { accountId: string; day: string; adj: number };

export function forwardFillNetWorth(rows: AccountDayAdj[]): NetWorthRow[] {
  const days = [...new Set(rows.map((r) => r.day))].sort();

  const byAccount = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = byAccount.get(r.accountId);
    if (m) m.set(r.day, r.adj);
    else byAccount.set(r.accountId, new Map([[r.day, r.adj]]));
  }

  const totals = new Map(days.map((d) => [d, 0]));
  for (const byDay of byAccount.values()) {
    let last: number | undefined;
    for (const day of days) {
      if (byDay.has(day)) last = byDay.get(day);
      if (last !== undefined) totals.set(day, totals.get(day)! + last);
    }
  }

  return days.map((day) => ({ day, net_worth: totals.get(day)! }));
}
