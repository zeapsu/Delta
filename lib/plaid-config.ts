import "server-only";
import { getPlaid } from "@/lib/plaid";
import { safePlaidError } from "@/lib/sync";
import { CountryCode } from "plaid";

// First-run check (#74): which Plaid environment is active, and whether its
// keys are present and accepted. Logged once at server start
// (instrumentation.ts) and shown on the welcome page before anything is
// linked, so a self-hoster sees a bad .env before trying Link.
export type PlaidCheck = {
  env: string;
  ok: boolean;
  problems: string[];
};

export function plaidConfigProblems(env: NodeJS.ProcessEnv = process.env): PlaidCheck {
  const plaidEnv = env.PLAID_ENV ?? "sandbox";
  const problems: string[] = [];
  if (plaidEnv !== "sandbox" && plaidEnv !== "production") {
    problems.push(`PLAID_ENV must be "sandbox" or "production", got "${plaidEnv}"`);
  }
  if (!env.PLAID_CLIENT_ID) problems.push("PLAID_CLIENT_ID is not set");
  const secretVar = plaidEnv === "production" ? "PLAID_PRODUCTION_SECRET" : "PLAID_SANDBOX_SECRET";
  if (!env[secretVar]) problems.push(`${secretVar} is not set (needed for PLAID_ENV=${plaidEnv})`);
  return { env: plaidEnv, ok: problems.length === 0, problems };
}

const g = globalThis as unknown as { __deltaPlaidCheck?: Promise<PlaidCheck> };

// One cheap authenticated call (/institutions/get, count 1) proves the client
// id + secret pair works. Cached per process; a failed check is retried on
// the next call so fixing .env and restarting isn't the only way out.
export function checkPlaid(): Promise<PlaidCheck> {
  if (!g.__deltaPlaidCheck) {
    g.__deltaPlaidCheck = run().then((r) => {
      if (!r.ok) g.__deltaPlaidCheck = undefined;
      return r;
    });
  }
  return g.__deltaPlaidCheck;
}

async function run(): Promise<PlaidCheck> {
  const config = plaidConfigProblems();
  if (!config.ok) return config;
  try {
    await getPlaid().institutionsGet({ count: 1, offset: 0, country_codes: [CountryCode.Us] });
    return config;
  } catch (err) {
    const e = safePlaidError(err);
    const problem =
      e.error_code === "INVALID_API_KEYS"
        ? `Plaid rejected PLAID_CLIENT_ID / secret for ${config.env} (INVALID_API_KEYS)`
        : `Plaid check failed: ${e.error_code}${e.error_code_reason ? ` (${e.error_code_reason})` : ""}`;
    return { ...config, ok: false, problems: [problem] };
  }
}
