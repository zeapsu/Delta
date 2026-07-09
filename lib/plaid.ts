import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// Lazy: `next build` imports route modules during page-data collection, so
// config validation must not throw at module scope (fresh clone has no .env).
let client: PlaidApi | undefined;

export function getPlaid(): PlaidApi {
  if (client) return client;
  const env = process.env.PLAID_ENV ?? "sandbox";
  if (env !== "sandbox" && env !== "production") {
    throw new Error(`PLAID_ENV must be "sandbox" or "production", got "${env}"`);
  }
  const secret =
    env === "production"
      ? process.env.PLAID_PRODUCTION_SECRET
      : process.env.PLAID_SANDBOX_SECRET;
  if (!secret) throw new Error(`Missing Plaid secret for PLAID_ENV=${env}`);

  client = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
          "PLAID-SECRET": secret,
        },
      },
    })
  );
  return client;
}

export const toCents = (n: number) => Math.round(n * 100);
