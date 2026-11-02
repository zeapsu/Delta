import Link from "next/link";
import { db } from "@/db";
import { items } from "@/db/schema";
import { hint } from "@/lib/plaid-keys";
import { currentPlaidKeys } from "@/lib/settings";
import { Card, Page } from "../ui";
import { PlaidKeysForm } from "./plaid-keys-form";

export const dynamic = "force-dynamic";

// First-run setup for one-click installs: paste Plaid keys here instead of
// editing .env. Installs whose .env has keys just see where they come from.
export default function SetupPage() {
  const keys = currentPlaidKeys();
  const linked = db.select({ id: items.id }).from(items).limit(1).all().length > 0;
  const env = keys.env === "production" ? "production" : "sandbox";

  return (
    <Page title="Set up Delta" subtitle="Two minutes: add your Plaid keys, then connect a bank." ask={false}>
      {keys.source === "env" ? (
        <Card title="Plaid keys" ask={false}>
          <p className="text-sm text-muted">
            This install reads its Plaid keys from <code>.env</code> ({keys.env}, client ID {hint(keys.clientId) ?? "not set"}).
            To change them, edit <code>.env</code> and restart Delta.
          </p>
          <div>
            <Link href="/" className="btn btn-primary">Go to Delta</Link>
          </div>
        </Card>
      ) : (
        <>
          <Card title="1. Get your Plaid keys" ask={false}>
            <p className="text-sm text-muted">
              Delta reads your accounts through Plaid with keys that belong to you. Sign up for free at{" "}
              <a className="underline" href="https://dashboard.plaid.com/signup" target="_blank" rel="noreferrer">
                dashboard.plaid.com
              </a>
              , then open{" "}
              <a className="underline" href="https://dashboard.plaid.com/developers/keys" target="_blank" rel="noreferrer">
                Developers → Keys
              </a>{" "}
              and copy your <code>client_id</code> and a secret. Start with <span className="font-medium">Sandbox</span> to try Delta
              with fake banks; the Production secret appears once Plaid approves your account (free for personal use, up
              to 10 banks).
            </p>
          </Card>
          <Card title="2. Paste them here" ask={false}>
            {keys.source === "setup" ? (
              <p className="text-sm text-muted">
                Saved: {keys.env}, client ID {hint(keys.clientId)}. Paste new keys to replace them.
              </p>
            ) : null}
            <PlaidKeysForm initialEnv={env} lockedEnv={linked && keys.source === "setup"} next="/" />
            <p className="text-xs text-muted">
              Keys are checked with Plaid, then stored in Delta&apos;s database on this machine, next to your bank
              connections. They&apos;re never shown again or sent anywhere else.
            </p>
          </Card>
        </>
      )}
    </Page>
  );
}
