import assert from "node:assert";
import {
  checkNewPassword,
  gate,
  newLogin,
  newSecret,
  parseStoredLogin,
  safeNext,
  sessionValue,
  SESSION_DAYS,
  Throttle,
  validSession,
  verifyPassword,
} from "./login";

const login = newLogin("correct horse");
assert.ok(login.hash.startsWith("scrypt$"));
assert.ok(verifyPassword("correct horse", login.hash));
assert.ok(!verifyPassword("correct hors", login.hash));
assert.ok(!verifyPassword("x", "garbage"));
assert.notStrictEqual(newLogin("correct horse").hash, login.hash, "salted");

assert.deepStrictEqual(parseStoredLogin(JSON.stringify(login)), login);
assert.strictEqual(parseStoredLogin("nope"), null);
assert.strictEqual(parseStoredLogin('{"hash":1}'), null);
assert.strictEqual(parseStoredLogin(undefined), null);

assert.strictEqual(checkNewPassword("12345678"), null);
assert.ok(checkNewPassword("1234567"));
assert.ok(checkNewPassword(undefined));
assert.ok(checkNewPassword("x".repeat(201)));

const now = 1_800_000_000_000;
const cookie = sessionValue(login.secret, now);
assert.ok(validSession(login.secret, cookie, now + 1000));
assert.ok(!validSession(login.secret, cookie, now + SESSION_DAYS * 86_400_000 + 1), "expired");
assert.ok(!validSession(newLogin("other pass").secret, cookie, now), "rotated secret");
// Logging out keeps the password and swaps the secret: every cookie dies.
assert.ok(!validSession(newSecret(), cookie, now), "logged out");
assert.notStrictEqual(newSecret(), newSecret());
assert.ok(!validSession(login.secret, cookie.replace(/^\d/, "9"), now), "tampered expiry");
assert.ok(!validSession(login.secret, undefined, now));
assert.ok(!validSession(login.secret, "abc", now));

assert.strictEqual(gate("/login", "GET"), "open");
assert.strictEqual(gate("/api/auth/login", "POST"), "open");
assert.strictEqual(gate("/api/plaid/sync", "POST"), "open");
assert.strictEqual(gate("/api/plaid/sync", "GET"), "api");
assert.strictEqual(gate("/api/v1/mcp", "POST"), "token");
assert.strictEqual(gate("/api/v1", "GET"), "token");
assert.strictEqual(gate("/api/v1x", "GET"), "api");
assert.strictEqual(gate("/api/settings/password", "PUT"), "api");
assert.strictEqual(gate("/api/tokens", "POST"), "api");
assert.strictEqual(gate("/", "GET"), "page");
assert.strictEqual(gate("/loginx", "GET"), "page");

assert.strictEqual(safeNext("/spending?month=2026-10"), "/spending?month=2026-10");
assert.strictEqual(safeNext("//evil.com"), "/");
assert.strictEqual(safeNext("/\\evil.com"), "/");
assert.strictEqual(safeNext("https://evil.com"), "/");
assert.strictEqual(safeNext("/login?next=/x"), "/");
assert.strictEqual(safeNext(null), "/");
// Browsers drop tabs/newlines and read "\" as "/": each of these is "//evil.com".
for (const sneaky of ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/x/../\\evil.com", "/ /evil.com", "/\u0000"]) {
  assert.strictEqual(safeNext(sneaky), "/", JSON.stringify(sneaky));
}
assert.strictEqual(safeNext(["/a", "/b"]), "/", "repeated ?next=");
assert.strictEqual(safeNext("/transactions?q=a%20b&page=2#top"), "/transactions?q=a%20b&page=2#top");

const t = new Throttle(3, 1000);
for (let i = 0; i < 3; i++) t.fail("a", now);
assert.ok(t.blocked("a", now));
assert.ok(!t.blocked("b", now));
assert.ok(!t.blocked("a", now + 1001), "window passes");
t.fail("c", now);
t.clear("c");
assert.ok(!t.blocked("c", now));

// A client that changes its address every try still runs into the overall cap.
const all = new Throttle(3, 1000, 5, 4);
for (let i = 0; i < 5; i++) {
  assert.ok(!all.blocked(`addr-${i}`, now), `try ${i} allowed`);
  all.fail(`addr-${i}`, now);
}
assert.ok(all.blocked("addr-new", now), "overall cap");
all.clear("addr-0");
assert.ok(all.blocked("addr-0", now), "a success elsewhere doesn't lift the overall cap");
assert.ok(!all.blocked("addr-new", now + 1001), "overall window passes");
assert.ok(all.size <= 4, "the per-address map stays bounded");

console.log("login-check: ok");
