import Link from "next/link";
import { db } from "@/db";
import { items } from "@/db/schema";
import { hint } from "@/lib/plaid-keys";
import { currentPlaidKeys } from "@/lib/settings";
import { Card, Page } from "../ui";
import { KeyFacts } from "./key-facts";
import { PlaidKeysForm } from "./plaid-keys-form";

export const dynamic = "force-dynamic";

// First-run setup for one-click installs: paste Plaid keys here instead of
// editing .env. Installs whose .env has keys just see where they come from.
export default function SetupPage() {
  const keys = currentPlaidKeys();
  const linked = db.select({ id: items.id }).from(items).limit(1).all().length > 0;
  const env = keys.env === "production" ? "production" : "sandbox";

  if (keys.source === "env") {
    return (
      <Page title="Plaid keys" ask={false}>
        <Card>
          <KeyFacts env={keys.env} clientId={hint(keys.clientId)} source=".env" />
          <p className="text-sm text-muted">To change them, edit .env and restart Delta.</p>
          <div>
            <Link href="/" className="btn btn-primary">Done</Link>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Set up Delta" subtitle="Add your Plaid keys, then connect a bank." ask={false}>
      <Card title="1. Get keys from Plaid" ask={false}>
        <p className="text-sm text-muted">Free for personal use, up to 10 banks.</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-sm" href="https://dashboard.plaid.com/signup" target="_blank" rel="noreferrer">
            Sign up <span aria-hidden>↗</span>
          </a>
          <a className="btn btn-sm" href="https://dashboard.plaid.com/developers/keys" target="_blank" rel="noreferrer">
            Open Keys page <span aria-hidden>↗</span>
          </a>
        </div>
      </Card>
      <Card title="2. Paste them" ask={false}>
        {keys.source === "setup" ? <KeyFacts env={keys.env} clientId={hint(keys.clientId)} source="Saved" /> : null}
        <PlaidKeysForm initialEnv={env} lockedEnv={linked} next="/" />
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
          </svg>
          Checked with Plaid, stored only on this machine.
        </p>
      </Card>
    </Page>
  );
}
