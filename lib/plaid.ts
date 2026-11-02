import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import type { PlaidKeys } from "@/lib/plaid-keys";
import { currentPlaidKeys } from "@/lib/settings";

// Lazy: `next build` imports route modules during page-data collection, so
// config validation must not throw at module scope (fresh clone has no .env).
// Keys come from the environment or the setup page (lib/plaid-keys.ts); the
// client is rebuilt when they change, so saving keys on /setup needs no restart.
let client: { id: string; api: PlaidApi } | undefined;

export function plaidClient(keys: PlaidKeys): PlaidApi {
  const env = keys.env;
  if (env !== "sandbox" && env !== "production") {
    throw new Error(`PLAID_ENV must be "sandbox" or "production", got "${env}"`);
  }
  if (!keys.clientId) throw new Error("Plaid keys aren't set up yet (open /setup or set PLAID_CLIENT_ID)");
  if (!keys.secret) throw new Error(`Missing Plaid secret for PLAID_ENV=${env}`);
  // Test-only: points the client at the e2e mock Plaid server (e2e/plaid-mock.mjs).
  const mockUrl = process.env.PLAID_MOCK_URL;
  if (mockUrl && env !== "sandbox") throw new Error("PLAID_MOCK_URL is only allowed with PLAID_ENV=sandbox");

  return new PlaidApi(
    new Configuration({
      basePath: mockUrl || PlaidEnvironments[env],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": keys.clientId,
          "PLAID-SECRET": keys.secret,
        },
      },
    })
  );
}

export function getPlaid(): PlaidApi {
  const keys = currentPlaidKeys();
  const id = `${keys.env}\n${keys.clientId}\n${keys.secret}`;
  if (client?.id !== id) client = { id, api: plaidClient(keys) };
  return client.api;
}

export const toCents = (n: number) => Math.round(n * 100);
