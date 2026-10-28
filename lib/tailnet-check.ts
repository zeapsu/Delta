import assert from "node:assert";
import { allowed, crossSiteWrite } from "./tailnet";

const req = (method: string, headers: Record<string, string>) =>
  new Request("http://100.116.56.85:3000/api/budgets", { method, headers });

// allowed(): loopback + 100.64.0.0/10 only.
for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "100.64.0.1", "100.127.255.255", "100.116.56.85, 10.0.0.1"]) {
  assert(allowed(req("GET", { "x-forwarded-for": ip })), `${ip} should be allowed`);
}
for (const ip of ["", "10.0.0.1", "100.63.0.1", "100.128.0.1", "192.168.1.5", "8.8.8.8"]) {
  assert(!allowed(req("GET", { "x-forwarded-for": ip })), `${ip} should be refused`);
}

// crossSiteWrite(): reads always pass; writes from another site are refused.
const host = "100.116.56.85:3000";
assert(!crossSiteWrite(req("GET", { host, origin: "https://evil.example", "sec-fetch-site": "cross-site" })));
assert(!crossSiteWrite(req("POST", { host })), "curl (no Origin) passes");
assert(!crossSiteWrite(req("POST", { host, origin: `http://${host}`, "sec-fetch-site": "same-origin" })));
assert(crossSiteWrite(req("POST", { host, origin: "https://evil.example", "sec-fetch-site": "cross-site" })));
assert(crossSiteWrite(req("DELETE", { host, "sec-fetch-site": "same-site" })), "another tailnet port is a different origin");
assert(crossSiteWrite(req("POST", { host, origin: "https://evil.example" })), "Origin mismatch without Sec-Fetch-Site");
assert(crossSiteWrite(req("POST", { host, origin: "null" })), "opaque Origin");

console.log("lib/tailnet-check.ts: all assertions passed");
