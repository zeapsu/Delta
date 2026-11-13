import assert from "node:assert";
import { allowed, crossSiteWrite, knownHost, shownHost } from "./tailnet";

const req = (method: string, headers: Record<string, string>) =>
  new Request("http://100.101.102.103:3000/api/budgets", { method, headers });

// allowed(): loopback + 100.64.0.0/10 by default.
for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "100.64.0.1", "100.127.255.255", "100.101.102.103, 10.0.0.1"]) {
  assert(allowed(req("GET", { "x-forwarded-for": ip })), `${ip} should be allowed`);
}
for (const ip of ["", "10.0.0.1", "100.63.0.1", "100.128.0.1", "192.168.1.5", "8.8.8.8"]) {
  assert(!allowed(req("GET", { "x-forwarded-for": ip })), `${ip} should be refused`);
}

// DELTA_ALLOWED_NETWORKS overrides the default (loopback always passes).
const lan = "192.168.1.0/24, 10.0.0.0/8";
for (const ip of ["192.168.1.5", "10.200.0.1", "127.0.0.1"]) {
  assert(allowed(req("GET", { "x-forwarded-for": ip }), lan), `${ip} should be allowed by ${lan}`);
}
for (const ip of ["192.168.2.5", "100.64.0.1"]) {
  assert(!allowed(req("GET", { "x-forwarded-for": ip }), lan), `${ip} should be refused by ${lan}`);
}
assert(allowed(req("GET", { "x-forwarded-for": "8.8.8.8" }), "0.0.0.0/0"), "0.0.0.0/0 allows any IPv4");
assert.throws(() => allowed(req("GET", { "x-forwarded-for": "10.0.0.1" }), "10.0.0.0/33"));

// crossSiteWrite(): reads always pass; writes from another site are refused.
const host = "100.101.102.103:3000";
assert(!crossSiteWrite(req("GET", { host, origin: "https://evil.example", "sec-fetch-site": "cross-site" })));
assert(!crossSiteWrite(req("POST", { host })), "curl (no Origin) passes");
assert(!crossSiteWrite(req("POST", { host, origin: `http://${host}`, "sec-fetch-site": "same-origin" })));
assert(crossSiteWrite(req("POST", { host, origin: "https://evil.example", "sec-fetch-site": "cross-site" })));
assert(crossSiteWrite(req("DELETE", { host, "sec-fetch-site": "same-site" })), "another tailnet port is a different origin");
assert(crossSiteWrite(req("POST", { host, origin: "https://evil.example" })), "Origin mismatch without Sec-Fetch-Site");
assert(crossSiteWrite(req("POST", { host, origin: "null" })), "opaque Origin");

// knownHost(): the DNS rebinding guard. Addresses and private names pass,
// a public name only when the owner listed it.
const named = (h: string, extra: Record<string, string> = {}) =>
  new Request("http://placeholder/", { headers: { host: h, ...extra } });
for (const h of [
  "100.101.102.103:3000", "127.0.0.1:3000", "192.168.1.20", "[::1]:3000", "[fd7a:115c:a1e0::1]:3000",
  "localhost:3000", "LOCALHOST", "nas:3000", "umbrel", "umbrel.local", "tower.local:3000", "nas.lan", "delta.home.arpa",
  "delta.internal", "app.localhost:3000", "abcdefghij234567.onion", "nas.tail1234.ts.net", "Nas.Tail1234.ts.net.:3000", "",
]) {
  assert(knownHost(named(h), "", ""), `${h} should be a known host`);
}
for (const h of [
  "evil.example", "evil.example:3000", "100.101.102.103.evil.example", "127.0.0.1.nip.io", "localhost.evil.example",
  "ts.net.evil.example", "evil-ts.net", "a.b", "exa mple.com", "evil.example/.local", "0x7f.1.evil.example",
]) {
  assert(!knownHost(named(h), "", ""), `${h} should be refused`);
}
// A rewritten Host doesn't launder the original name.
assert(!knownHost(named("delta:3000", { "x-forwarded-host": "evil.example" }), "", ""));
assert(knownHost(named("delta:3000", { "x-forwarded-host": "nas.tail1234.ts.net" }), "", ""));
// DELTA_URL's host and DELTA_ALLOWED_HOSTS are the owner's own names.
assert(knownHost(named("money.example.com"), "", "https://money.example.com"));
assert(!knownHost(named("other.example.com"), "", "https://money.example.com"));
assert(knownHost(named("money.example.com:8443"), " Money.Example.com , x.example.org", ""));
assert(knownHost(named("a.b.example.org"), "*.example.org", ""));
assert(!knownHost(named("example.org"), "*.example.org", ""), "the wildcard covers subdomains only");
assert(!knownHost(named("evilexample.org"), "*.example.org", ""));
assert(knownHost(named("evil.example"), "*", ""), '"*" turns the check off');
assert(!knownHost(named("evil.example"), "", "not a url"));
assert.strictEqual(shownHost(named('Evil.Example:3000"><script>')), "evil.example:3000script");

console.log("lib/tailnet-check.ts: all assertions passed");
