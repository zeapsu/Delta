import { formatCents } from "@/lib/format";
import { recurringOverview } from "@/lib/insights";
import { Card, Empty, Page, Stat } from "@/app/ui";
import { AddRuleForm, RuleRow, SuggestionCard } from "./recurring-form";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const { suggestions, confirmed, monthlyEstimate } = await recurringOverview();

  return (
    <Page title="Recurring" subtitle="Bills and subscriptions.">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5">
        <Card>
          <Stat label="Per month (est.)" value={formatCents(monthlyEstimate)} />
        </Card>
        <Card>
          <Stat label="Per year (est.)" value={formatCents(Math.round((monthlyEstimate * 365) / 30))} />
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <Stat
            label="Tracked"
            value={confirmed.length}
            sub={suggestions.length > 0 ? `${suggestions.length} to review` : "All reviewed"}
          />
        </Card>
      </div>

      {suggestions.length > 0 && (
        <Card title={`Spotted by Delta · ${suggestions.length}`}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {suggestions.map((s) => (
              <SuggestionCard
                key={`${s.matchKey}-${s.amount}`}
                suggestion={{
                  matchKey: s.matchKey,
                  merchant: s.merchant,
                  amount: s.amount,
                  cadence: s.cadence,
                  gapDays: s.gapDays,
                  lastDate: s.lastDate,
                  count: s.count,
                }}
              />
            ))}
          </div>
        </Card>
      )}

      <Card title="Confirmed">
        {confirmed.length === 0 ? (
          <Empty>
            None yet. Confirm a suggestion or add one below.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Cadence</th>
                  <th className="py-2 pr-4 font-medium">Last</th>
                  <th className="py-2 pr-4 font-medium">Next expected</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {confirmed.map((r) => (
                  <RuleRow
                    key={r.id}
                    rule={{
                      id: r.id,
                      name: r.name,
                      amount: r.amount,
                      gapDays: r.gapDays,
                      anchorDate: r.anchorDate,
                    }}
                    cadence={r.cadence}
                    lastDate={r.lastDate}
                    nextDate={r.nextDate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Add manually" ask={false}>
        <AddRuleForm />
      </Card>
    </Page>
  );
}
