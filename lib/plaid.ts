import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const env = process.env.PLAID_ENV ?? "sandbox";
if (env !== "sandbox" && env !== "production") {
  throw new Error(`PLAID_ENV must be "sandbox" or "production", got "${env}"`);
}
const secret =
  env === "production"
    ? process.env.PLAID_PRODUCTION_SECRET
    : process.env.PLAID_SANDBOX_SECRET;
if (!secret) throw new Error(`Missing Plaid secret for PLAID_ENV=${env}`);

const configuration = new Configuration({
  basePath: PlaidEnvironments[env],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": secret,
    },
  },
});

export const plaid = new PlaidApi(configuration);

export const toCents = (n: number) => Math.round(n * 100);
