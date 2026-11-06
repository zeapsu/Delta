import Link from "next/link";
import { isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { hint } from "@/lib/plaid-keys";
import { currentPlaidKeys, getAnalysisSettings, getProfile } from "@/lib/settings";
import { ProfileForm } from "../profile-form";
import { Card, Page } from "../ui";
import { AnalysisForm } from "./analysis-form";
import { KeyFacts } from "../setup/key-facts";
import { Agents } from "./agents";
import { PhoneAccess } from "./phone";
import { PasswordSettings } from "./password";
import { getLogin } from "@/lib/login-store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { analysis } = await getAnalysisSettings();
  const keys = currentPlaidKeys();
  const tokens = db
    .select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, scope: apiTokens.scope, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(isNull(apiTokens.revokedAt))
    .orderBy(apiTokens.id)
    .all()
    .map(({ lastUsedAt, ...t }) => ({
      ...t,
      used: lastUsedAt ? `Used ${lastUsedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Never used",
    }));
  const url = process.env.DELTA_URL;
  const profile = getProfile();
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <Page title="Settings" ask={false}>
      <Card id="you" title="You" ask={false}>
        <ProfileForm name={profile.name} timeZone={profile.effectiveTimeZone} zones={zones} />
      </Card>
      <Card id="password" title="Password" ask={false}>
        <PasswordSettings enabled={getLogin() !== null} />
      </Card>
      <Card title="How closely your agent watches spending" ask={false}>
        <AnalysisForm initial={analysis} />
      </Card>
      <Card id="agents" title="Agents" ask={false}>
        <Agents tokens={tokens} baseUrl={url ?? null} />
      </Card>
      {/* Home server app installs already serve the whole home network. */}
      {process.env.DELTA_INSTALL === "stack" ? null : (
        <Card id="phone" title="Use on your phone" ask={false}>
          <PhoneAccess url={url} />
        </Card>
      )}
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
