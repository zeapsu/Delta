import { formatCents } from "@/lib/format";
import { getNetWorthData } from "@/lib/networth-data";
import { CHART_COLORS } from "@/lib/colors";
import { NetWorthLine, type NetWorthPoint, type NetWorthSeriesDef } from "@/app/charts";

export const dynamic = "force-dynamic";

export default async function NetWorthPage() {
  const { days, total: rows, accounts } = await getNetWorthData();

  const latest = rows.at(-1)?.net_worth ?? null;

  // Per-account lines only when there's more than one account (a single
  // account would just duplicate the total). ponytail: capped at 8 accounts —
  // the palette's fixed slot count; fold into "Other" if that day comes.
  const shown = accounts.length > 1 ? accounts.slice(0, 8) : [];
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

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-16">
        <h1 className="text-2xl font-semibold">Net worth</h1>

        <div>
          <span className="text-sm opacity-60">Current net worth</span>
          <p className="text-2xl font-semibold">{formatCents(latest)}</p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm opacity-60">Sync to start tracking net worth.</p>
        ) : rows.length === 1 ? (
          <p className="text-sm opacity-60">
            First snapshot recorded — the history chart appears once there&apos;s
            more than one day of data.
          </p>
        ) : (
          <NetWorthLine data={data} series={series} />
        )}
      </main>
    </div>
  );
}
