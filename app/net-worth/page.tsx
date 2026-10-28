import { db } from "@/db";
import { accounts } from "@/db/schema";
import { DEBT_TYPES, formatCents } from "@/lib/format";
import { getNetWorthData } from "@/lib/networth-data";
import { CHART_COLORS } from "@/lib/colors";
import { NetWorthLine, type NetWorthPoint, type NetWorthSeriesDef } from "@/app/charts";
import { Card, Change, Empty, Meter, Page, Stat } from "@/app/ui";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  depository: "Cash",
  investment: "Investments",
  brokerage: "Investments",
  credit: "Credit cards",
  loan: "Loans",
  other: "Other",
};

export default async function NetWorthPage() {
  const [{ days, total: rows, accounts: accountSeries }, allAccounts] = await Promise.all([
    getNetWorthData(),
    db.select().from(accounts),
  ]);

  const latest = rows.at(-1)?.net_worth ?? null;
  const first = rows[0]?.net_worth ?? null;
  const values = rows.map((r) => r.net_worth);
  const high = values.length ? Math.max(...values) : null;

  // Per-account lines only when there's more than one account (a single
  // account would just duplicate the total). ponytail: capped at 8 accounts —
  // the palette's fixed slot count; fold into "Other" if that day comes.
  const shown = accountSeries.length > 1 ? accountSeries.slice(0, 8) : [];
  const series: NetWorthSeriesDef[] = shown.map((a, i) => ({
    key: `a${i}`,
    name: a.name,
    color: CHART_COLORS[i],
  }));
  const data: NetWorthPoint[] = days.map((day, di) => {
    const point: NetWorthPoint = { day, total: rows[di].net_worth };
    shown.forEach((a, i) => {
      point[`a${i}`] = a.values[di];
    });
    return point;
  });

  // Composition from current balances, grouped by account type.
  const groups = new Map<string, { label: string; debt: boolean; total: number }>();
  for (const a of allAccounts) {
    const label = TYPE_LABELS[a.type] ?? "Other";
    const debt = DEBT_TYPES.has(a.type);
    const g = groups.get(label) ?? { label, debt, total: 0 };
    g.total += a.currentBalance ?? 0;
    groups.set(label, g);
  }
  const assetGroups = [...groups.values()].filter((g) => !g.debt).sort((a, b) => b.total - a.total);
  const debtGroups = [...groups.values()].filter((g) => g.debt).sort((a, b) => b.total - a.total);
  const assets = assetGroups.reduce((s, g) => s + g.total, 0);
  const debts = debtGroups.reduce((s, g) => s + g.total, 0);
  const scale = Math.max(assets, debts, 1);

  return (
    <Page title="Net worth" subtitle="Assets minus what you owe, from daily balance snapshots.">
      <Card>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <Stat
            size="lg"
            label="Current"
            value={formatCents(latest)}
            sub={
              latest !== null && first !== null && rows.length > 1 ? (
                <Change current={latest} previous={first} suffix={`since ${rows[0].day}`} goodWhenUp />
              ) : undefined
            }
          />
          {high !== null && rows.length > 1 ? <Stat label="All-time high" value={formatCents(high)} /> : null}
        </div>
        {rows.length === 0 ? (
          <Empty>Sync to start tracking net worth.</Empty>
        ) : rows.length === 1 ? (
          <Empty>
            First snapshot recorded — the history chart appears once there&apos;s more than
            one day of data.
          </Empty>
        ) : (
          <NetWorthLine data={data} series={series} />
        )}
      </Card>

      {allAccounts.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          <Card title="Assets" action={<span className="text-sm font-semibold tabular-nums">{formatCents(assets)}</span>}>
            <Composition groups={assetGroups} scale={scale} tone="positive" />
          </Card>
          <Card title="Liabilities" action={<span className="text-sm font-semibold tabular-nums">{formatCents(debts)}</span>}>
            {debtGroups.length === 0 ? (
              <Empty>No debts linked.</Empty>
            ) : (
              <Composition groups={debtGroups} scale={scale} tone="negative" />
            )}
          </Card>
        </div>
      ) : null}
    </Page>
  );
}

// Bars share one scale across both cards so assets and debts compare honestly.
function Composition({
  groups,
  scale,
  tone,
}: {
  groups: { label: string; total: number }[];
  scale: number;
  tone: "positive" | "negative";
}) {
  return (
    <ul className="flex flex-col gap-3">
      {groups.map((g) => (
        <li key={g.label} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span>{g.label}</span>
            <span className="tabular-nums text-muted">{formatCents(g.total)}</span>
          </div>
          <Meter value={g.total} max={scale} tone={tone} label={`${g.label} share`} />
        </li>
      ))}
    </ul>
  );
}
