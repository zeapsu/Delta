// Where Delta's Plaid keys come from (pure: no DB, no Plaid client, so the
// self-check, lib/plaid.ts and scripts/unlink-items.ts all share it).
//
// Two sources, env first:
// - .env / the container environment (PLAID_CLIENT_ID + the secret for
//   PLAID_ENV), the CLI install and bare-metal hosts. Set PLAID_CLIENT_ID and the
//   environment is the only source; the setup page shows it read-only.
// - the setup page (/setup), for home server app installs that start with no .env:
//   saved as the "plaid" row of the settings table. The DB already holds the
//   Plaid access tokens, so the secret sits next to them (and in backups).
//   Never return the secret from any route.

export const PLAID_ENVS = ["sandbox", "production"] as const;
export type PlaidEnvName = (typeof PLAID_ENVS)[number];

export type StoredPlaidKeys = { env: PlaidEnvName; clientId: string; secret: string };

export type PlaidKeys = {
  env: string;
  clientId?: string;
  secret?: string;
  // env: from the environment. setup: saved on /setup. none: nothing yet.
  source: "env" | "setup" | "none";
};

// The env vars this reads (not NodeJS.ProcessEnv, so tests can pass a literal).
export type KeyEnv = Partial<Record<string, string | undefined>>;

export const SETTINGS_KEY = "plaid";

const isEnv = (v: unknown): v is PlaidEnvName => PLAID_ENVS.includes(v as PlaidEnvName);

// Plaid client ids are 24 hex chars and secrets 30, but don't bet on the
// format: one token of key-ish characters.
const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

export function envHasKeys(env: KeyEnv): boolean {
  return Boolean(env.PLAID_CLIENT_ID?.trim());
}

export function resolvePlaidKeys(env: KeyEnv, stored: StoredPlaidKeys | null): PlaidKeys {
  if (envHasKeys(env) || !stored) {
    const plaidEnv = env.PLAID_ENV || "sandbox";
    return {
      env: plaidEnv,
      clientId: env.PLAID_CLIENT_ID?.trim() || undefined,
      secret: (plaidEnv === "production" ? env.PLAID_PRODUCTION_SECRET : env.PLAID_SANDBOX_SECRET)?.trim() || undefined,
      source: envHasKeys(env) ? "env" : "none",
    };
  }
  return { ...stored, source: "setup" };
}

// The settings row, as stored. Anything malformed counts as not set up.
export function parseStoredKeys(json: string | null | undefined): StoredPlaidKeys | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    const r = parsePlaidKeysInput(v);
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}

// Body of PUT /api/settings/plaid: { env, clientId, secret }.
export function parsePlaidKeysInput(
  body: unknown,
): { ok: true; value: StoredPlaidKeys } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (!isEnv(b.env)) return { ok: false, error: 'env must be "sandbox" or "production"' };
  const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
  const secret = typeof b.secret === "string" ? b.secret.trim() : "";
  if (!KEY_RE.test(clientId)) return { ok: false, error: "That client ID doesn't look right. Copy it from Plaid's Keys page." };
  if (!KEY_RE.test(secret)) return { ok: false, error: "That secret doesn't look right. Copy it from Plaid's Keys page." };
  return { ok: true, value: { env: b.env, clientId, secret } };
}

// For display: enough to recognize which key it is, not enough to use it.
export function hint(key: string | undefined): string | null {
  if (!key) return null;
  return key.length <= 8 ? "…" : `${key.slice(0, 4)}…${key.slice(-4)}`;
}
