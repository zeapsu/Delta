import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// ponytail: sandbox hardcoded; env-switch at M6 production
const configuration = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SANDBOX_SECRET,
    },
  },
});

export const plaid = new PlaidApi(configuration);

export const toCents = (n: number) => Math.round(n * 100);
