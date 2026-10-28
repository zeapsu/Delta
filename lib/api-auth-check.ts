import assert from "node:assert";
import { bearerToken, hashToken, newToken, requiredScope, scopeAllows, tokenPrefix } from "./api-auth";

// Tokens: well-formed, unique, hash is stable hex.
const t = newToken();
assert.match(t, /^dlt_[A-Za-z0-9_-]{43}$/);
assert.notStrictEqual(t, newToken());
assert.strictEqual(hashToken(t), hashToken(t));
assert.match(hashToken(t), /^[0-9a-f]{64}$/);
assert.strictEqual(tokenPrefix(t), t.slice(0, 8));

// bearerToken(): absent vs malformed vs ok.
assert.strictEqual(bearerToken(null), undefined);
assert.strictEqual(bearerToken(`Bearer ${t}`), t);
assert.strictEqual(bearerToken(`bearer ${t}`), t);
assert.strictEqual(bearerToken(t), null, "missing Bearer scheme");
assert.strictEqual(bearerToken("Bearer abc"), null, "wrong shape");
assert.strictEqual(bearerToken("Basic dXNlcjpwYXNz"), null);

// requiredScope(): /api/v1 always needs a token; older routes only check one
// that was sent, so the dashboard and the sync timer keep working.
assert.strictEqual(requiredScope("/api/v1/accounts", "GET", false), "read");
assert.strictEqual(requiredScope("/api/v1", "GET", false), "read");
assert.strictEqual(requiredScope("/api/v1/budgets", "POST", false), "write");
assert.strictEqual(requiredScope("/api/v1/recurring", "DELETE", true), "write");
assert.strictEqual(requiredScope("/api/v10/x", "GET", false), null);
// MCP posts reads too; its write tools check write scope per call.
assert.strictEqual(requiredScope("/api/v1/mcp", "POST", false), "read");
assert.strictEqual(requiredScope("/api/v1/mcp", "GET", true), "read");
assert.strictEqual(requiredScope("/api/budgets", "POST", false), null);
assert.strictEqual(requiredScope("/api/plaid/sync", "POST", false), null);
assert.strictEqual(requiredScope("/api/budgets", "GET", true), "read");
assert.strictEqual(requiredScope("/api/budgets", "POST", true), "write");

// scopeAllows(): write implies read; unknown scopes get nothing.
assert(scopeAllows("read", "read"));
assert(scopeAllows("write", "read"));
assert(scopeAllows("write", "write"));
assert(!scopeAllows("read", "write"));
assert(!scopeAllows("admin", "read"));

console.log("lib/api-auth-check.ts: all assertions passed");
