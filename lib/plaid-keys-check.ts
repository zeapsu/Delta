import assert from "node:assert";
import { hint, parsePlaidKeysInput, parseStoredKeys, resolvePlaidKeys } from "./plaid-keys";

const ID = "test-client-id-0001";
const SECRET = "test-secret-value-0001";
const stored = { env: "sandbox" as const, clientId: ID, secret: SECRET };

// Nothing anywhere: not set up.
assert.deepStrictEqual(resolvePlaidKeys({}, null), { env: "sandbox", clientId: undefined, secret: undefined, source: "none" });
// Blank lines copied from .env.example don't count as keys.
assert.strictEqual(resolvePlaidKeys({ PLAID_CLIENT_ID: " ", PLAID_ENV: "sandbox" }, stored).source, "setup");
// Setup-page keys apply when the environment has none.
assert.deepStrictEqual(resolvePlaidKeys({}, stored), { ...stored, source: "setup" });
// The environment wins, and picks the secret for its PLAID_ENV.
assert.deepStrictEqual(
  resolvePlaidKeys({ PLAID_CLIENT_ID: "env-id", PLAID_ENV: "production", PLAID_SANDBOX_SECRET: "s", PLAID_PRODUCTION_SECRET: "p" }, stored),
  { env: "production", clientId: "env-id", secret: "p", source: "env" },
);
// An env client id without its secret is still the env's (broken) config, not a fallback.
assert.deepStrictEqual(resolvePlaidKeys({ PLAID_CLIENT_ID: "env-id" }, stored), {
  env: "sandbox",
  clientId: "env-id",
  secret: undefined,
  source: "env",
});

// Input validation.
assert.deepStrictEqual(parsePlaidKeysInput({ env: "sandbox", clientId: ` ${ID} `, secret: SECRET }), { ok: true, value: stored });
const bad = (b: unknown) => assert.strictEqual(parsePlaidKeysInput(b).ok, false, JSON.stringify(b));
bad(null);
bad([]);
bad({ env: "development", clientId: ID, secret: SECRET });
bad({ env: "sandbox", clientId: "", secret: SECRET });
bad({ env: "sandbox", clientId: ID, secret: "has space in it" });
bad({ env: "sandbox", clientId: ID });

// Stored row: malformed means not set up.
assert.deepStrictEqual(parseStoredKeys(JSON.stringify(stored)), stored);
assert.strictEqual(parseStoredKeys("{"), null);
assert.strictEqual(parseStoredKeys(JSON.stringify({ env: "sandbox" })), null);
assert.strictEqual(parseStoredKeys(null), null);

// Hints never show the middle of a key.
assert.strictEqual(hint(ID), "test…0001");
assert.strictEqual(hint("short"), "…");
assert.strictEqual(hint(undefined), null);

console.log("plaid-keys-check: ok");
