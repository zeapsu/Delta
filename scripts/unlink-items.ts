// Disconnect every linked bank at Plaid (/item/remove). Run before you
// uninstall Delta: Plaid bills subscription products (Transactions,
// Investments) per connected item every month until the item is removed, and
// deleting the database alone doesn't tell Plaid anything.
//   npm run unlink           list what would be removed
//   npm run unlink -- --yes  remove them (the access tokens stop working)
// Rows stay in the database so you keep your history until you delete it.

// .env first (DATABASE_PATH, Plaid keys); values already in the environment win.
try {
  process.loadEnvFile();
} catch {}

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

function plaid(): PlaidApi {
  // Same selection as lib/plaid.ts, which is server-only and can't load here.
  const env = process.env.PLAID_ENV ?? "sandbox";
  if (env !== "sandbox" && env !== "production") throw new Error(`PLAID_ENV must be "sandbox" or "production", got "${env}"`);
  const secret = env === "production" ? process.env.PLAID_PRODUCTION_SECRET : process.env.PLAID_SANDBOX_SECRET;
  if (!secret) throw new Error(`Missing Plaid secret for PLAID_ENV=${env}`);
  const mockUrl = env === "sandbox" ? process.env.PLAID_MOCK_URL : undefined;
  return new PlaidApi(
    new Configuration({
      basePath: mockUrl || PlaidEnvironments[env],
      baseOptions: { headers: { "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID, "PLAID-SECRET": secret } },
    }),
  );
}

async function main() {
  const yes = process.argv.includes("--yes");
  const { db } = await import("../db");
  const { items } = await import("../db/schema");
  const { safePlaidError } = await import("../lib/plaid-errors");
  const rows = await db.select({ id: items.id, accessToken: items.accessToken, name: items.institutionName }).from(items);
  if (!rows.length) return console.log("No linked banks.");
  if (!yes) {
    for (const r of rows) console.log(`${r.id}\t${r.name ?? "(unnamed)"}`);
    return console.log(`\n${rows.length} linked. Run again with --yes to remove them at Plaid.`);
  }
  const client = plaid();
  let failed = 0;
  for (const r of rows) {
    try {
      await client.itemRemove({ access_token: r.accessToken });
      console.log(`removed ${r.id} ${r.name ?? ""}`);
    } catch (err) {
      failed++;
      // Never print the raw error: its config carries the secret and token.
      const e = safePlaidError(err);
      console.error(`failed ${r.id} ${r.name ?? ""}: ${e.error_code ?? "error"} ${e.error_code_reason ?? ""}`.trimEnd());
    }
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
