import Link from "next/link";
import { db } from "@/db";
import { desc, isNull } from "drizzle-orm";
import { accounts, apiTokens, investmentTransactions, items, transactions } from "@/db/schema";
import { DEBT_TYPES, formatCategory, formatCents } from "@/lib/format";
import { getNetWorthData } from "@/lib/networth-data";
import { categoryColor } from "@/lib/colors";
import {
  budgetProgress,
  budgetTone,
  categoryTotals,
  monthlyCashFlow,
  recurringOverview,
  spendThroughDay,
} from "@/lib/insights";
import {
  currentMonth,
  daysAgoISO,
  timeAgo,
  daysUntil,
  recentMonths,
  shiftMonth,
  shortDate,
  shortMonthLabel,
} from "@/lib/months";
import { CashFlowChart, TrendArea } from "./charts";
import PlaidButtons from "./plaid-buttons";
import { checkPlaid } from "@/lib/plaid-config";
import ConnectionButton from "./connection-button";
import { FirstSync } from "./first-sync";
import { REAUTH_ERROR_CODES } from "@/lib/plaid-errors";
import { currentPlaidKeys, getAnalysisSettings, getProfile } from "@/lib/settings";
import { greeting as greet } from "@/lib/profile";
import { Welcome } from "./welcome";
import { hint } from "@/lib/plaid-keys";
import { getLogin } from "@/lib/login-store";
import { Card, Change, Empty, Meter, Money, Page, Stat, Steps, Tint } from "./ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const month = currentMonth();
  const day = new Date().getDate();
  const months = recentMonths(6);

  const [
    allItems,
    allAccounts,
    netWorth,
    cashFlow,
    spentSoFar,
    spentLastMonthSoFar,
    categories,
    budgetRows,
    recurring,
    recent,
    analysisSettings,
  ] = await Promise.all([
    db.select().from(items),
    db.select().from(accounts),
    getNetWorthData(),
    monthlyCashFlow(months),
    spendThroughDay(month, day),
    spendThroughDay(shiftMonth(month, -1), day),
    categoryTotals(month),
    budgetProgress(month),
    recurringOverview(),
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        name: transactions.name,
        merchantName: transactions.merchantName,
        category: transactions.category,
        amount: transactions.amount,
        pending: transactions.pending,
      })
      .from(transactions)
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(6),
    getAnalysisSettings(),
  ]);

  const profile = getProfile();

  if (allItems.length === 0) {
    const plaid = await checkPlaid();
    return (
      <Welcome
        name={profile.name}
        timeZone={profile.effectiveTimeZone}
        nameSaved={profile.saved}
        plaid={{
          ok: plaid.ok,
          env: plaid.env,
          source: plaid.source,
          problems: plaid.missing ? [] : plaid.problems,
          clientId: hint(currentPlaidKeys().clientId),
        }}
      />
    );
  }

  // History is in once any transactions arrived. Brokerage-only setups never
  // get /transactions rows, so investment activity (or having no cash or card
  // accounts at all) counts too.
  const historyDone =
    db.select({ id: transactions.id }).from(transactions).limit(1).all().length > 0 ||
    db.select({ id: investmentTransactions.id }).from(investmentTransactions).limit(1).all().length > 0 ||
    !allAccounts.some((a) => a.type === "depository" || a.type === "credit");
  const hasToken =
    db.select({ id: apiTokens.id }).from(apiTokens).where(isNull(apiTokens.revokedAt)).limit(1).all().length > 0;

  const hasPassword = getLogin() !== null;

  const signed = (a: { type: string; currentBalance: number | null }) => {
    const b = a.currentBalance ?? 0;
    return DEBT_TYPES.has(a.type) ? -b : b;
  };
  const assets = allAccounts.filter((a) => !DEBT_TYPES.has(a.type)).reduce((s, a) => s + signed(a), 0);
  const liabilities = -allAccounts.filter((a) => DEBT_TYPES.has(a.type)).reduce((s, a) => s + signed(a), 0);
  const net = assets - liabilities;

  // 30-day change from the snapshot history (closest day on/before 30 days ago).
  const history = netWorth.total;
  const cutoff = daysAgoISO(30);
  const baseline = [...history].reverse().find((r) => r.day <= cutoff) ?? history[0];
  const trend = history.slice(-90).map((r) => ({ label: shortDate(r.day), value: r.net_worth }));

  const spending = categories.filter((c) => c.total > 0);
  const topCats = spending.slice(0, 5);
  // Same slot assignment as the /spending donut for this month, so a
  // category wears one color across the app.
  const top8 = spending.slice(0, 8).map((c) => c.category ?? "UNCATEGORIZED");
  const colorFor = (category: string | null) => categoryColor(category ?? "UNCATEGORIZED", top8);
  const topMax = topCats[0]?.total ?? 0;

  const lastSix = cashFlow.map((m) => ({ label: shortMonthLabel(m.month), income: m.income, spending: m.spending }));
  const completed = cashFlow.slice(0, -1).filter((m) => m.income > 0 || m.spending > 0);
  const avgNet =
    completed.length > 0
      ? completed.reduce((s, m) => s + m.income - m.spending, 0) / completed.length
      : null;

  const upcoming = recurring.confirmed
    .filter((r) => r.nextDate && daysUntil(r.nextDate) >= 0 && daysUntil(r.nextDate) <= 30)
    .sort((a, b) => (a.nextDate! < b.nextDate! ? -1 : 1));
  const upcomingTotal = upcoming.reduce((s, r) => s + r.amount, 0);

  const budgetsSorted = [...budgetRows].sort((a, b) => b.pct - a.pct);
  const overCount = budgetRows.filter((b) => b.pct > 100).length;
  const nearCount = budgetRows.filter((b) => b.pct >= 80 && b.pct <= 100).length;

  const institutions = allItems.map((item) => ({
    id: item.id,
    name: item.institutionName ?? "Unknown institution",
    accounts: allAccounts.filter((a) => a.itemId === item.id),
    needsReauth: item.lastErrorCode !== null && REAUTH_ERROR_CODES.has(item.lastErrorCode),
    transientError:
      item.lastErrorCode !== null && !REAUTH_ERROR_CODES.has(item.lastErrorCode)
        ? item.lastErrorCode
        : null,
    syncedLabel: item.lastSyncedAt ? timeAgo(item.lastSyncedAt) : null,
  }));
  const broken = institutions.filter((i) => i.needsReauth);

  const greeting = greet(new Date().getHours(), profile.name);
  const lastSynced = allItems.reduce<Date | null>(
    (latest, i) => (i.lastSyncedAt && (!latest || i.lastSyncedAt > latest) ? i.lastSyncedAt : latest),
    null,
  );

  return (
    <Page
      wide
      title={greeting}
      subtitle={
        <>
          {/* Short on phones so the date and sync time stay on one line beside Ask Agent. */}
          <span className="sm:hidden">
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
          <span className="hidden sm:inline">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </span>
          {lastSynced ? ` · synced ${timeAgo(lastSynced)}` : ""}
        </>
      }
    >
      {broken.length > 0 ? (
        <a
          href="#accounts"
          className="flex items-center gap-3 rounded-2xl border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
            !
          </span>
          <span>
            <span className="font-medium">
              {broken.map((b) => b.name).join(", ")} disconnected
            </span>
          </span>
          <span className="ml-auto shrink-0 font-medium text-negative">Reconnect →</span>
        </a>
      ) : null}
      {!historyDone || !analysisSettings.customized || !profile.saved ? (
        <Card title="Getting started" ask={false}>
          <Steps
            steps={[
              {
                title: "Connect a bank, card or brokerage",
                state: "done",
                detail: `${allAccounts.length} account${allAccounts.length === 1 ? "" : "s"} linked`,
              },
              {
                title: "Pull your history",
                state: historyDone ? "done" : "todo",
                action: historyDone ? null : <FirstSync />,
                detail: historyDone ? undefined : "Plaid usually takes a few minutes. Delta keeps checking.",
              },
              {
                title: "Your name and time zone",
                state: profile.saved ? "done" : "todo",
                action: profile.saved ? null : (
                  <Link href="/settings#you" className="btn btn-sm">Set</Link>
                ),
                detail: profile.saved ? undefined : `Dates use ${profile.effectiveTimeZone.replace(/_/g, " ")} for now.`,
              },
              {
                title: "Choose your agent's watch level",
                state: analysisSettings.customized ? "done" : "todo",
                action: analysisSettings.customized ? null : (
                  <Link href="/settings" className="btn btn-sm btn-primary">Choose</Link>
                ),
              },
              {
                title: "Set a password (optional)",
                state: hasPassword ? "done" : "todo",
                action: hasPassword ? null : (
                  <Link href="/settings#password" className="btn btn-sm">Set</Link>
                ),
              },
              {
                title: "Connect an agent (optional)",
                state: hasToken ? "done" : "todo",
                action: hasToken ? null : (
                  <Link href="/settings#agents" className="btn btn-sm">Connect</Link>
                ),
              },
            ]}
          />
        </Card>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <Card
          className="lg:col-span-2"
          title="Net worth"
          action={<Link href="/net-worth" className="text-xs text-muted hover:text-foreground">History →</Link>}
        >
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <Stat
              size="lg"
              label="Today"
              value={<Money cents={net} />}
              sub={
                history.length > 1 && baseline ? (
                  <Change current={net} previous={baseline.net_worth} suffix="in 30 days" goodWhenUp />
                ) : (
                  "Trend after a few syncs"
                )
              }
            />
            <Stat label="Assets" value={formatCents(assets)} />
            <Stat label="Liabilities" value={<span className="text-negative">{formatCents(liabilities)}</span>} />
          </div>
          {trend.length > 1 ? (
            <TrendArea
              data={trend}
              height={200}
              color={trend[trend.length - 1].value >= trend[0].value ? "var(--chart-in)" : "var(--chart-out)"}
            />
          ) : null}
        </Card>

        <Card
          title="This month"
          action={<Link href="/spending" className="text-xs text-muted hover:text-foreground">Breakdown →</Link>}
        >
          <Stat
            size="lg"
            label={`Spent through ${shortDate(`${month}-${String(day).padStart(2, "0")}`)}`}
            value={<Money cents={spentSoFar} />}
            sub={
              <Change
                current={spentSoFar}
                previous={spentLastMonthSoFar}
                suffix="vs same day last month"
                goodWhenUp={false}
              />
            }
          />
          {topCats.length === 0 ? (
            <Empty>No spending yet this month.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {topCats.map((c) => (
                <li key={c.category ?? "null"} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{formatCategory(c.category)}</span>
                    <span className="tabular-nums text-muted">{formatCents(c.total)}</span>
                  </div>
                  <Meter
                    value={c.total}
                    max={topMax}
                    color={colorFor(c.category)}
                    label={`${formatCategory(c.category)} spending`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          className="lg:col-span-2"
          title="Cash flow"
          action={
            avgNet !== null ? (
              <span className="text-xs text-muted">
                Avg net {formatCents(Math.round(avgNet))}/mo
              </span>
            ) : null
          }
        >
          <CashFlowChart data={lastSix} />
        </Card>

        <Card
          title="Budgets"
          action={<Link href="/budgets" className="text-xs text-muted hover:text-foreground">Manage →</Link>}
        >
          {budgetRows.length === 0 ? (
            <Empty href="/budgets" cta="Set a budget">
              No budgets yet.
            </Empty>
          ) : (
            <>
              <p className="text-sm">
                <span className={overCount > 0 ? "font-medium text-negative" : nearCount > 0 ? "font-medium text-warning" : ""}>
                  {overCount > 0
                    ? `${overCount} over budget`
                    : nearCount > 0
                      ? `${nearCount} close to the limit`
                      : "Everything on track"}
                </span>
                <span className="text-muted"> · {budgetRows.length} budgets</span>
              </p>
              <ul className="flex flex-col gap-3">
                {budgetsSorted.slice(0, 4).map((b) => (
                  <li key={b.category} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{formatCategory(b.category)}</span>
                      <span className={`tabular-nums ${b.pct > 100 ? "text-negative" : "text-muted"}`}>
                        {Math.round(b.pct)}%{b.pct > 100 ? " · over" : ""}
                      </span>
                    </div>
                    <Meter
                      value={b.spent}
                      max={b.monthlyAmount}
                      tone={budgetTone(b.pct)}
                      label={`${formatCategory(b.category)} budget used`}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card
          title="Upcoming · 30 days"
          action={<Link href="/recurring" className="text-xs text-muted hover:text-foreground">Recurring →</Link>}
        >
          {upcoming.length === 0 ? (
            <Empty href="/recurring" cta={recurring.suggestions.length > 0 ? `Review ${recurring.suggestions.length} suggestions` : "Add recurring"}>
              Nothing due.
            </Empty>
          ) : (
            <>
              <Stat label="Due next 30 days" value={formatCents(upcomingTotal)} />
              <ul className="flex flex-col divide-y divide-hairline">
                {upcoming.slice(0, 5).map((r) => {
                  const d = daysUntil(r.nextDate!);
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-fill py-1 text-center leading-tight">
                        <span className="text-[10px] uppercase text-muted">
                          {shortMonthLabel(r.nextDate!.slice(0, 7))}
                        </span>
                        <span className="font-semibold">{Number(r.nextDate!.slice(8))}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{r.name}</span>
                        <span className="text-xs text-muted">
                          {d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`} · {r.cadence}
                        </span>
                      </span>
                      <span className="tabular-nums">{formatCents(r.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>

        <Card
          className="lg:col-span-2"
          title="Recent activity"
          action={<Link href="/transactions" className="text-xs text-muted hover:text-foreground">All transactions →</Link>}
        >
          {recent.length === 0 ? (
            <Empty>No transactions yet.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {recent.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Tint color={tx.amount < 0 ? "var(--chart-in)" : colorFor(tx.category)}>
                    {(tx.merchantName ?? tx.name).slice(0, 1)}
                  </Tint>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{tx.merchantName ?? tx.name}</span>
                    <span className="text-xs text-muted">
                      {shortDate(tx.date)} · {formatCategory(tx.category)}
                      {tx.pending ? " · Pending" : ""}
                    </span>
                  </span>
                  <span className={`tabular-nums font-medium ${tx.amount < 0 ? "text-positive" : ""}`}>
                    {tx.amount < 0 ? `+${formatCents(-tx.amount)}` : formatCents(tx.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h2 id="accounts" className="scroll-mt-16 text-lg font-semibold tracking-tight">Accounts</h2>
        <PlaidButtons compact />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {institutions.map((inst) => {
          const subtotal = inst.accounts.reduce((sum, a) => sum + signed(a), 0);
          return (
            <Card
              key={inst.id}
              title={inst.name}
              action={
                <ConnectionButton
                  itemId={inst.id}
                  institution={inst.name}
                  needsReauth={inst.needsReauth}
                  transientError={inst.transientError}
                  syncedLabel={inst.syncedLabel}
                />
              }
            >
              <div className="-mt-2 flex flex-col gap-0.5">
                <span className="text-xl font-semibold tabular-nums">{formatCents(subtotal)}</span>
                <span className={`text-xs ${inst.needsReauth ? "text-negative" : "text-muted"}`}>
                  {inst.needsReauth
                    ? "Disconnected · sign in again"
                    : inst.transientError
                      ? `Sync failed (${inst.transientError}) · retrying`
                      : inst.syncedLabel
                        ? `Synced ${inst.syncedLabel}`
                        : "Not synced yet"}
                </span>
              </div>
              {inst.accounts.length === 0 ? (
                <Empty>No accounts.</Empty>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline">
                  {inst.accounts.map((account) => (
                    <li key={account.id} className="flex items-center justify-between gap-4 py-2">
                      <Link
                        href={`/transactions?account=${account.id}`}
                        className="flex min-w-0 flex-col hover:opacity-80"
                      >
                        <span className="truncate text-sm font-medium">
                          {account.name}
                          {account.mask ? ` ····${account.mask}` : ""}
                        </span>
                        <span className="text-xs capitalize text-muted">
                          {account.subtype ?? account.type}
                        </span>
                      </Link>
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          DEBT_TYPES.has(account.type) && account.currentBalance ? "text-negative" : ""
                        }`}
                      >
                        {DEBT_TYPES.has(account.type) && account.currentBalance
                          ? formatCents(-account.currentBalance)
                          : formatCents(account.currentBalance)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
