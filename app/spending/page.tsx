import Link from "next/link";
import { formatCategory, formatCents } from "@/lib/format";
import { categoryColor } from "@/lib/colors";
import { categoryTotals, monthlyCashFlow } from "@/lib/insights";
import { currentMonth, isMonth, monthLabel, recentMonths, shiftMonth, shortMonthLabel } from "@/lib/months";
import { CategoryDonut, MonthBars, type DonutSlice } from "@/app/charts";
import { Card, Change, Dot, Empty, Meter, Page, Stat } from "@/app/ui";

export const dynamic = "force-dynamic";

type SearchParams = {
  month?: string;
};

function lastDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // Guard covers the heading, the SQL LIKE, and the prev/next links.
  const month = isMonth(params.month) ? params.month : currentMonth();
  const isCurrent = month === currentMonth();
  const trendMonths = recentMonths(6, month);

  const [rows, trend] = await Promise.all([categoryTotals(month), monthlyCashFlow(trendMonths)]);

  const spending = rows.filter((r) => r.total > 0);
  const grandTotal = spending.reduce((sum, r) => sum + r.total, 0);
  const max = Math.max(...spending.map((r) => r.total), 0);
  const pendingSum = rows.reduce((s, r) => s + Math.max(r.pendingTotal, 0), 0);
  const prevTotal = trend.at(-2)?.spending ?? 0;
  const priorMonths = trend.slice(0, -1).filter((m) => m.spending > 0);
  const avg = priorMonths.length
    ? priorMonths.reduce((s, m) => s + m.spending, 0) / priorMonths.length
    : 0;

  // Donut: top 8 categories + "Other". Slots come from the displayed set in
  // sorted order, so colors are deterministic and distinct within the chart.
  // ponytail: a category can shift color when the month's top-8 changes; a
  // persistent per-category color map is the upgrade if that ever grates.
  const top = spending.slice(0, 8);
  const otherTotal = spending.slice(8).reduce((s, r) => s + r.total, 0);
  const topCategories = top.map((r) => r.category ?? "UNCATEGORIZED");
  const donutData: DonutSlice[] = top.map((r) => ({
    name: formatCategory(r.category),
    value: r.total,
    color: categoryColor(r.category ?? "UNCATEGORIZED", topCategories),
  }));
  if (otherTotal > 0) {
    donutData.push({ name: "Other", value: otherTotal, color: "var(--chart-muted)" });
  }

  const txHref = (category: string | null) => {
    const q = new URLSearchParams({ from: `${month}-01`, to: lastDay(month) });
    if (category) q.set("category", category);
    return `/transactions?${q}`;
  };

  return (
    <Page
      title="Spending"
      subtitle="Excludes transfers and income."
      actions={
        <div className="glass flex items-center gap-1 rounded-full p-1">
          <Link
            href={`/spending?month=${shiftMonth(month, -1)}`}
            aria-label="Previous month"
            className="rounded-full px-3 py-1.5 text-sm hover:bg-fill"
          >
            ←
          </Link>
          <span className="min-w-32 text-center text-sm font-medium">{monthLabel(month)}</span>
          {isCurrent ? (
            <span className="px-3 py-1.5 text-sm opacity-30" aria-hidden>
              →
            </span>
          ) : (
            <Link
              href={`/spending?month=${shiftMonth(month, 1)}`}
              aria-label="Next month"
              className="rounded-full px-3 py-1.5 text-sm hover:bg-fill"
            >
              →
            </Link>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        <Card className="md:col-span-1">
          <Stat
            size="lg"
            label={isCurrent ? "Spent so far" : "Total spent"}
            value={formatCents(grandTotal)}
            sub={pendingSum > 0 ? `incl. ${formatCents(pendingSum)} pending` : undefined}
          />
          <div className="flex flex-col gap-1 text-xs">
            <Change current={grandTotal} previous={prevTotal} suffix="vs last month" goodWhenUp={false} />
            {avg > 0 ? (
              <span className="text-muted">
                6-month average {formatCents(Math.round(avg))}
              </span>
            ) : null}
          </div>
        </Card>
        <Card className="md:col-span-2" title="Last 6 months">
          <MonthBars
            data={trend.map((m) => ({
              label: shortMonthLabel(m.month),
              value: m.spending,
              current: m.month === month,
            }))}
          />
        </Card>
      </div>

      {spending.length === 0 ? (
        <Card>
          <Empty>No spending in {monthLabel(month)}.</Empty>
        </Card>
      ) : (
        <>
          <Card title="Where it went">
            <CategoryDonut data={donutData} total={grandTotal} />
          </Card>
          <Card title="By category" action={<span className="text-xs text-muted">Tap a row to see transactions</span>}>
            <ul className="-mx-2 flex flex-col">
              {spending.map((r) => (
                <li key={r.category ?? "null"}>
                  <Link
                    href={txHref(r.category)}
                    className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-fill sm:gap-3"
                  >
                    <span className="flex w-28 shrink-0 items-center gap-2 text-sm sm:w-40">
                      <Dot color={categoryColor(r.category ?? "UNCATEGORIZED", topCategories)} />
                      <span className="truncate">{formatCategory(r.category)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <Meter
                        value={r.total}
                        max={max}
                        color={categoryColor(r.category ?? "UNCATEGORIZED", topCategories)}
                        label={`${formatCategory(r.category)} spending`}
                      />
                    </span>
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted sm:w-12">
                      {Math.round((r.total / grandTotal) * 100)}%
                    </span>
                    <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums sm:w-24">
                      {formatCents(r.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Page>
  );
}
