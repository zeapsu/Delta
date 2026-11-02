import Link from "next/link";
import { hint } from "@/lib/plaid-keys";
import { currentPlaidKeys, getAnalysisSettings } from "@/lib/settings";
import { Card, Page } from "../ui";
import { AnalysisForm } from "./analysis-form";
import { KeyFacts } from "../setup/key-facts";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { analysis } = await getAnalysisSettings();
  const keys = currentPlaidKeys();
  return (
    <Page title="Settings" ask={false}>
      <Card title="How closely your agent watches spending" ask={false}>
        <AnalysisForm initial={analysis} />
      </Card>
      <Card
        title="Plaid"
        ask={false}
        action={
          keys.source === "env" ? null : (
            <Link href="/setup" className="btn btn-sm">
              {keys.source === "none" ? "Set up" : "Replace"}
            </Link>
          )
        }
      >
        {keys.source === "none" ? (
          <p className="text-sm text-muted">No keys yet.</p>
        ) : (
          <KeyFacts env={keys.env} clientId={hint(keys.clientId)} source={keys.source === "env" ? ".env" : "Saved"} />
        )}
      </Card>
    </Page>
  );
}
