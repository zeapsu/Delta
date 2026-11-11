import { expect, test } from "@playwright/test";
import { apiRoutes, bearer, MOCK_ACCESS_TOKEN, MOCK_PLAID_URL, PENDING_THIS_MONTH_CENTS, SPEND_THIS_MONTH_CENTS, THIS_MONTH, tokens } from "./helpers";

const V1_READS = [
  "/api/v1",
  "/api/v1/status",
  "/api/v1/accounts",
  "/api/v1/transactions",
  "/api/v1/spending",
  "/api/v1/cash-flow",
  "/api/v1/budgets",
  "/api/v1/recurring",
  "/api/v1/net-worth",
  "/api/v1/investments",
];

test("v1 needs a valid token", async ({ request }) => {
  expect((await request.get("/api/v1/accounts")).status()).toBe(401);
  expect((await request.get("/api/v1/accounts", { headers: bearer("dlt_nope") })).status()).toBe(401);
});

test("every v1 read answers 200 and never leaks a Plaid access token", async ({ request }) => {
  for (const path of V1_READS) {
    const res = await request.get(path, { headers: bearer(tokens().read) });
    expect(res.status(), path).toBe(200);
    const text = await res.text();
    expect(text, path).not.toContain(MOCK_ACCESS_TOKEN);
    expect(text, path).not.toMatch(/access_?token|sync_?cursor/i);
  }
});

test("the first sync stored the fixture", async ({ request }) => {
  const h = bearer(tokens().read);
  const { accounts } = await (await request.get("/api/v1/accounts", { headers: h })).json();
  expect(accounts.map((a: { name: string }) => a.name).sort()).toEqual(["Brokerage", "Everyday Checking", "Rewards Card"]);

  // Transfers, income and card payments are not spend; pending charges are.
  const spending = await (await request.get(`/api/v1/spending?month=${THIS_MONTH}`, { headers: h })).json();
  expect(spending.total).toBe(SPEND_THIS_MONTH_CENTS);
  expect(spending.pendingTotal).toBe(PENDING_THIS_MONTH_CENTS);

  const status = await (await request.get("/api/v1/status", { headers: h })).json();
  expect(status.connections).toHaveLength(1);
  expect(status.connections[0].lastErrorCode).toBeNull();
});

test("bad params are 400, not 500", async ({ request }) => {
  const res = await request.get("/api/v1/spending?month=2026-13", { headers: bearer(tokens().read) });
  expect(res.status()).toBe(400);
});

test("writes need a write token and are validated", async ({ request }) => {
  const body = { category: "ENTERTAINMENT", monthlyAmount: 50_00 };
  expect((await request.post("/api/v1/budgets", { headers: bearer(tokens().read), data: body })).status()).toBe(403);
  expect(
    (await request.post("/api/v1/budgets", { headers: bearer(tokens().write), data: { category: "lower", monthlyAmount: 1 } })).status(),
  ).toBe(400);
  expect((await request.post("/api/v1/budgets", { headers: bearer(tokens().write), data: body })).status()).toBe(200);
  const { budgets } = await (await request.get("/api/v1/budgets", { headers: bearer(tokens().read) })).json();
  expect(JSON.stringify(budgets)).toContain("ENTERTAINMENT");
  expect((await request.delete("/api/v1/budgets", { headers: bearer(tokens().write), data: { category: "ENTERTAINMENT" } })).status()).toBe(200);

  // A recurring charge needs a day that exists.
  const rule = { status: "confirmed", name: "Probe", amount: 5_00, gapDays: 30 };
  for (const anchorDate of ["2026-02-30", "0000-00-00", "2026-13-01"]) {
    const res = await request.post("/api/v1/recurring", { headers: bearer(tokens().write), data: { ...rule, anchorDate } });
    expect(res.status(), anchorDate).toBe(400);
  }
});

test("cross-site browser writes are refused", async ({ request }) => {
  const res = await request.post("/api/budgets", {
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    data: { category: "FOOD_AND_DRINK", monthlyAmount: 100 },
  });
  expect(res.status()).toBe(403);
});

// proxy.ts must see every /api request. Its matcher once skipped paths ending
// in an extension, and a dynamic route also answers "/api/tokens/1.0".
test("the network guard covers every API route, whatever the path ends in", async ({ request }) => {
  const outside = { "x-forwarded-for": "8.8.8.8" };
  const routes = apiRoutes();
  expect(routes).toContain("/api/tokens/1");
  expect(routes.length).toBeGreaterThan(20);
  for (const route of routes) {
    for (const path of [route, `${route}.0`, `${route}.json`, `${route}/x.png`]) {
      expect((await request.get(path, { headers: outside })).status(), path).toBe(403);
    }
  }
  expect((await request.delete("/api/tokens/1.0", { headers: outside })).status()).toBe(403);
  expect((await request.delete("/api/tokens/1.0", { headers: { "sec-fetch-site": "cross-site" } })).status()).toBe(403);
  // And the route itself takes plain ids only.
  expect((await request.delete("/api/tokens/1.0")).status()).toBe(400);
});

// DNS rebinding: a website points its own domain at Delta's private address
// and reads it "same-origin" through a visitor's browser. The request comes
// from an allowed device, so only the name gives it away.
test("pages and dashboard routes answer only to addresses Delta knows", async ({ request }) => {
  const as = (host: string) => ({ headers: { host }, maxRedirects: 0 });
  for (const path of ["/", "/transactions", "/login", "/api/budgets", "/api/tokens", "/api/settings"]) {
    const res = await request.get(path, as("evil.example:3100"));
    expect(res.status(), path).toBe(403);
    expect(await res.text(), path).toContain("DELTA_ALLOWED_HOSTS=evil.example");
  }
  expect((await request.post("/api/plaid/sync", as("evil.example"))).status()).toBe(403);
  expect((await request.get("/api/budgets", { headers: { "x-forwarded-host": "evil.example" } })).status()).toBe(403);
  // The message never echoes markup.
  expect(await (await request.get("/", as("evil.example<script>"))).text()).not.toContain("<");

  // Addresses, private names and Tailscale names are how owners reach it.
  for (const host of ["100.116.56.85:3100", "[::1]:3100", "localhost:3100", "jetson", "delta.local:3100", "jetson.tail1234.ts.net"]) {
    expect((await request.get("/api/budgets", as(host))).status(), host).toBe(200);
    expect((await request.get("/spending", as(host))).status(), host).toBe(200);
  }
  // Agents carry a token, which a web page can't have, so /api/v1 takes any name.
  const v1 = await request.get("/api/v1/status", { headers: { host: "delta.example.com", ...bearer(tokens().read) } });
  expect(v1.status()).toBe(200);
  expect((await request.get("/api/v1/status", as("delta.example.com"))).status()).toBe(401);
});

test("the login page never redirects off the site", async ({ request, baseURL }) => {
  // No password is set here, so /login redirects straight to ?next=.
  for (const next of ["/%09/evil.example", "/%0A/evil.example", "//evil.example", "/%5Cevil.example", "https://evil.example"]) {
    const res = await request.get(`/login?next=${next}`, { maxRedirects: 0 });
    expect(res.status(), next).toBe(307);
    expect(res.headers().location, next).toBe("/");
  }
  const ok = await request.get("/login?next=/spending%3Fmonth%3D2026-10", { maxRedirects: 0 });
  expect(new URL(ok.headers().location, baseURL).pathname).toBe("/spending");
});

test("responses refuse framing and don't name the server", async ({ request }) => {
  for (const path of ["/", "/settings", "/api/budgets"]) {
    const h = (await request.get(path)).headers();
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
});

test("sync is idempotent and refresh works against Plaid", async ({ request }) => {
  const h = bearer(tokens().read);
  const before = (await (await request.get("/api/v1/transactions?limit=1", { headers: h })).json()).total;
  expect((await request.post("/api/plaid/refresh")).status()).toBe(200);
  expect((await request.post("/api/plaid/sync")).status()).toBe(200);
  const after = (await (await request.get("/api/v1/transactions?limit=1", { headers: h })).json()).total;
  expect(after).toBe(before);
});

test("overlapping syncs queue up instead of doubling anything", async ({ request }) => {
  const h = bearer(tokens().read);
  const count = async () => (await (await request.get("/api/v1/transactions?limit=1", { headers: h })).json()).total;
  const before = await count();
  const { connections } = await (await request.get("/api/v1/status", { headers: h })).json();
  const one = { data: { item_id: connections[0].id } };
  const runs = await Promise.all([
    request.post("/api/plaid/sync"),
    request.post("/api/plaid/sync", one),
    request.post("/api/plaid/sync"),
    request.post("/api/plaid/sync", one),
  ]);
  expect(runs.map((r) => r.status())).toEqual([200, 200, 200, 200]);
  expect(await count()).toBe(before);
  expect((await request.post("/api/plaid/sync", { data: { item_id: 999_999 } })).status()).toBe(404);
});

test("linking a bank that is already connected is refused, not doubled", async ({ request }) => {
  const h = bearer(tokens().read);
  const state = async () => ({
    accounts: (await (await request.get("/api/v1/accounts", { headers: h })).json()).accounts.length,
    connections: (await (await request.get("/api/v1/status", { headers: h })).json()).connections.length,
  });
  const before = await state();

  // Plaid makes a new item with new account ids for the same login.
  const res = await request.post("/api/plaid/exchange", {
    data: { public_token: "public-sandbox-mock-again", institution_name: "Mock Bank" },
  });
  expect(res.status()).toBe(409);
  expect(await res.json()).toEqual({ error: "Mock Bank is already connected" });
  expect(await state()).toEqual(before);
  // The extra item is removed at Plaid, where it would be billed.
  const { removed } = await (await request.post(`${MOCK_PLAID_URL}/__mock/removed`)).json();
  expect(removed).toEqual(["access-sandbox-mock-2"]);
});

test("a relabel made while a charge is pending survives it posting", async ({ request }) => {
  const read = bearer(tokens().read);
  const write = bearer(tokens().write);
  const probe = async () =>
    (await (await request.get("/api/v1/transactions?q=Relabel%20Probe", { headers: read })).json()).transactions;

  const made = await request.post(`${MOCK_PLAID_URL}/__mock/pending`, { data: { name: "Relabel Probe" } });
  const { transaction_id } = await made.json();
  expect((await request.post("/api/plaid/sync")).status()).toBe(200);
  const [pending] = await probe();
  expect(pending).toMatchObject({ pending: true, category: "TRANSFER_OUT" });
  const relabel = await request.post("/api/v1/transactions/category", { headers: write, data: { id: pending.id, category: "TRANSFER_IN" } });
  expect(relabel.status()).toBe(200);

  await request.post(`${MOCK_PLAID_URL}/__mock/post`, { data: { transaction_id } });
  expect((await request.post("/api/plaid/sync")).status()).toBe(200);
  const rows = await probe();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ pending: false, category: "TRANSFER_IN" });

  // Still the user's label, not a copy of it: resetting goes back to the bank's.
  await request.post("/api/v1/transactions/category", { headers: write, data: { id: rows[0].id, category: null } });
  expect((await probe())[0].category).toBe("TRANSFER_OUT");
});

test("Plaid keys from .env can't be replaced from the browser", async ({ request }) => {
  const status = await (await request.get("/api/settings/plaid")).json();
  expect(status).toEqual({ source: "env", env: "sandbox", clientId: "mock…ient", configured: true });
  expect(JSON.stringify(status)).not.toContain("mock-secret");
  const res = await request.put("/api/settings/plaid", {
    data: { env: "sandbox", clientId: "test-client-id-0001", secret: "test-secret-value-0001" },
  });
  expect(res.status()).toBe(409);
});

test("tokens are managed from the browser, never by agents", async ({ request }) => {
  expect((await request.post("/api/tokens", { data: { name: "  ", scope: "read" } })).status()).toBe(400);
  expect((await request.post("/api/tokens", { data: { name: "x", scope: "admin" } })).status()).toBe(400);
  expect((await request.get("/api/tokens", { headers: bearer(tokens().write) })).status()).toBe(403);
  expect((await request.post("/api/tokens", { headers: bearer(tokens().write), data: { name: "x", scope: "write" } })).status()).toBe(403);

  const res = await request.post("/api/tokens", { data: { name: "browser", scope: "read" } });
  expect(res.status()).toBe(201);
  const { id, token } = await res.json();
  expect((await request.get("/api/v1/status", { headers: bearer(token) })).status()).toBe(200);
  const list = await (await request.get("/api/tokens")).json();
  expect(list.tokens.map((t: { name: string }) => t.name)).toContain("browser");
  expect(JSON.stringify(list)).not.toMatch(/hash|dlt_[A-Za-z0-9_-]{20}/i);

  expect((await request.delete(`/api/tokens/${id}`)).status()).toBe(200);
  expect((await request.get("/api/v1/status", { headers: bearer(token) })).status()).toBe(401);
  expect((await request.delete(`/api/tokens/${id}`)).status()).toBe(404);
});

test("profile: name and time zone are validated and drive the greeting", async ({ request }) => {
  expect((await request.put("/api/settings/profile", { data: { timeZone: "Mars/Olympus" } })).status()).toBe(400);
  expect((await request.put("/api/settings/profile", { data: { name: "x".repeat(41) } })).status()).toBe(400);
  // UTC, like the rest of the suite: the fixture is dated in UTC.
  const res = await request.put("/api/settings/profile", { data: { name: "Robin", timeZone: "UTC" } });
  expect(await res.json()).toEqual({ ok: true, name: "Robin", timeZone: "UTC", effectiveTimeZone: "UTC" });
  expect(await (await request.get("/")).text()).toMatch(/Good (morning|afternoon|evening), Robin/);
});
