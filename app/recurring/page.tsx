import { formatCents } from "@/lib/format";
import { recurringOverview } from "@/lib/insights";
import { Card, Empty, Money, Page, Stat } from "@/app/ui";
import { AddRuleForm, EndedRow, PossiblyEndedRow, RuleRow, SuggestionCard } from "./recurring-form";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const { suggestions, confirmed, possiblyEnded, ended, monthlyEstimate } = await recurringOverview();
  const toReview = [
    suggestions.length > 0 ? `${suggestions.length} to review` : null,
    possiblyEnded.length > 0 ? `${possiblyEnded.length} to check` : null,
  ].filter(Boolean);

  return (
    <Page title="Recurring" subtitle="Bills and subscriptions.">
      {confirmed.length > 0 ? (
        <Card>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <Stat
              size="lg"
              label="Per month (est.)"
              value={<Money cents={monthlyEstimate} />}
              sub={[`${confirmed.length} tracked`, ...toReview].join(" · ")}
            />
            <Stat label="Per year (est.)" value={formatCents(Math.round((monthlyEstimate * 365) / 30))} />
          </div>
        </Card>
      ) : null}

      {suggestions.length > 0 && (
        <Card title={`Looks recurring · ${suggestions.length}`}>
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

      {possiblyEnded.length > 0 && (
        <Card title={`Possibly ended · ${possiblyEnded.length}`} action={<span className="text-xs text-muted">Not in totals</span>}>
          <ul className="flex flex-col divide-y divide-hairline">
            {possiblyEnded.map((r) => (
              <PossiblyEndedRow
                key={r.id}
                rule={{ id: r.id, name: r.name, amount: r.amount }}
                cadence={r.cadence}
                lastDate={r.lastDate}
              />
            ))}
          </ul>
        </Card>
      )}

      <Card title="Tracked" action={confirmed.length > 0 ? <span className="text-xs text-muted">Next charge</span> : null}>
        {confirmed.length === 0 ? (
          <Empty>
            Nothing tracked yet.
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {[...confirmed]
              .sort((a, b) => (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999"))
              .map((r) => (
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
          </ul>
        )}
      </Card>

      {ended.length > 0 && (
        <Card title={`Ended · ${ended.length}`}>
          <ul className="flex flex-col divide-y divide-hairline">
            {ended.map((r) => (
              <EndedRow key={r.id} rule={{ id: r.id, name: r.name, amount: r.amount }} lastDate={r.lastDate} />
            ))}
          </ul>
        </Card>
      )}

      <Card title="Add manually" ask={false}>
        <AddRuleForm />
      </Card>
    </Page>
  );
}
