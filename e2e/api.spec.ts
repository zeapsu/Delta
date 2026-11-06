import { expect, test } from "@playwright/test";
import { bearer, MOCK_ACCESS_TOKEN, PENDING_THIS_MONTH_CENTS, SPEND_THIS_MONTH_CENTS, THIS_MONTH, tokens } from "./helpers";

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
});

test("cross-site browser writes are refused", async ({ request }) => {
  const res = await request.post("/api/budgets", {
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    data: { category: "FOOD_AND_DRINK", monthlyAmount: 100 },
  });
  expect(res.status()).toBe(403);
});

test("sync is idempotent and refresh works against Plaid", async ({ request }) => {
  const h = bearer(tokens().read);
  const before = (await (await request.get("/api/v1/transactions?limit=1", { headers: h })).json()).total;
  expect((await request.post("/api/plaid/refresh")).status()).toBe(200);
  expect((await request.post("/api/plaid/sync")).status()).toBe(200);
  const after = (await (await request.get("/api/v1/transactions?limit=1", { headers: h })).json()).total;
  expect(after).toBe(before);
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
