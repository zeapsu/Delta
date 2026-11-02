import Link from "next/link";
import { hint } from "@/lib/plaid-keys";
import { currentPlaidKeys, getAnalysisSettings } from "@/lib/settings";
import { Card, Page } from "../ui";
import { AnalysisForm } from "./analysis-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { analysis } = await getAnalysisSettings();
  const keys = currentPlaidKeys();
  return (
    <Page title="Settings" ask={false}>
      <Card title="How closely your agent watches spending" ask={false}>
        <AnalysisForm initial={analysis} />
      </Card>
      <Card title="Plaid" ask={false}>
        <p className="text-sm text-muted">
          {keys.source === "none"
            ? "No Plaid keys yet."
            : `${keys.env === "production" ? "Production" : "Sandbox"}, client ID ${hint(keys.clientId) ?? "not set"}, ${
                keys.source === "env" ? "from .env (edit it and restart Delta to change)." : "saved on the setup page."
              }`}
        </p>
        {keys.source === "env" ? null : (
          <div>
            <Link href="/setup" className="btn">
              {keys.source === "none" ? "Set up Plaid" : "Replace keys"}
            </Link>
          </div>
        )}
      </Card>
    </Page>
  );
}
