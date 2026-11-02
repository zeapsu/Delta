// Disconnect every linked bank at Plaid (/item/remove). Run before you
// uninstall Delta: Plaid bills subscription products (Transactions,
// Investments) per connected item every month until the item is removed, and
// deleting the database alone doesn't tell Plaid anything.
//   npm run unlink           list what would be removed
//   npm run unlink -- --yes  remove them (the access tokens stop working)
// Rows stay in the database so you keep your history until you delete it.

// .env first (DATABASE_PATH, Plaid keys); values already in the environment win.
// Keys saved on the setup page are used when .env has none.
try {
  process.loadEnvFile();
} catch {}

import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// Same selection as lib/plaid.ts (server-only, can't load here): the
// environment's keys, else the ones saved on the setup page.
async function plaid(): Promise<PlaidApi> {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../db");
  const { settings } = await import("../db/schema");
  const { parseStoredKeys, resolvePlaidKeys, SETTINGS_KEY } = await import("../lib/plaid-keys");
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, SETTINGS_KEY)).get();
  const keys = resolvePlaidKeys(process.env, parseStoredKeys(row?.value));
  const env = keys.env;
  if (env !== "sandbox" && env !== "production") throw new Error(`PLAID_ENV must be "sandbox" or "production", got "${env}"`);
  if (!keys.clientId) throw new Error("No Plaid keys (not in .env, not saved on the setup page)");
  if (!keys.secret) throw new Error(`Missing Plaid secret for PLAID_ENV=${env}`);
  const mockUrl = env === "sandbox" ? process.env.PLAID_MOCK_URL : undefined;
  return new PlaidApi(
    new Configuration({
      basePath: mockUrl || PlaidEnvironments[env],
      baseOptions: { headers: { "PLAID-CLIENT-ID": keys.clientId, "PLAID-SECRET": keys.secret } },
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
  const client = await plaid();
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
