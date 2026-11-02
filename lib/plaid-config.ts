import "server-only";
import { plaidClient } from "@/lib/plaid";
import type { PlaidKeys } from "@/lib/plaid-keys";
import { currentPlaidKeys } from "@/lib/settings";
import { safePlaidError } from "@/lib/sync";
import { CountryCode } from "plaid";

// First-run check (#74): which Plaid environment is active, and whether its
// keys are present and accepted. Logged once at server start
// (instrumentation.ts) and shown on the welcome page before anything is
// linked, so a self-hoster sees bad keys before trying Link.
export type PlaidCheck = {
  env: string;
  ok: boolean;
  problems: string[];
  // Nothing configured anywhere yet: the welcome page sends you to /setup.
  missing?: boolean;
  source: PlaidKeys["source"];
};

export function plaidConfigProblems(keys: PlaidKeys = currentPlaidKeys()): PlaidCheck {
  const problems: string[] = [];
  if (keys.source === "none" && !keys.clientId) {
    return { env: keys.env, ok: false, missing: true, source: keys.source, problems: ["no keys yet: open Delta and paste them on /setup, or set them in .env"] };
  }
  if (keys.env !== "sandbox" && keys.env !== "production") {
    problems.push(`PLAID_ENV must be "sandbox" or "production", got "${keys.env}"`);
  }
  if (!keys.clientId) problems.push("PLAID_CLIENT_ID is not set");
  const secretVar = keys.env === "production" ? "PLAID_PRODUCTION_SECRET" : "PLAID_SANDBOX_SECRET";
  if (!keys.secret) problems.push(`${secretVar} is not set (needed for PLAID_ENV=${keys.env})`);
  return { env: keys.env, ok: problems.length === 0, problems, source: keys.source };
}

const g = globalThis as unknown as { __deltaPlaidCheck?: Promise<PlaidCheck> };

// One cheap authenticated call (/institutions/get, count 1) proves the client
// id + secret pair works. Cached per process; a failed check is retried on
// the next call, and saving keys on /setup clears it (resetPlaidCheck).
export function checkPlaid(): Promise<PlaidCheck> {
  if (!g.__deltaPlaidCheck) {
    g.__deltaPlaidCheck = testPlaidKeys(currentPlaidKeys()).then((r) => {
      if (!r.ok) g.__deltaPlaidCheck = undefined;
      return r;
    });
  }
  return g.__deltaPlaidCheck;
}

export function resetPlaidCheck() {
  g.__deltaPlaidCheck = undefined;
}

export async function testPlaidKeys(keys: PlaidKeys): Promise<PlaidCheck> {
  const config = plaidConfigProblems(keys);
  if (!config.ok) return config;
  try {
    await plaidClient(keys).institutionsGet({ count: 1, offset: 0, country_codes: [CountryCode.Us] });
    return config;
  } catch (err) {
    const e = safePlaidError(err);
    const problem =
      e.error_code === "INVALID_API_KEYS"
        ? `Plaid rejected the client ID / secret for ${config.env} (INVALID_API_KEYS)`
        : `Plaid check failed: ${e.error_code}${e.error_code_reason ? ` (${e.error_code_reason})` : ""}`;
    return { ...config, ok: false, problems: [problem] };
  }
}
