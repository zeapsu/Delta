import { expect, test } from "@playwright/test";
import { bearer, MOCK_PLAID_URL, tokens } from "./helpers";

// A bank login expires: the sync must fail loudly (502 so the timer's curl -f
// fails), record the code, and the overview must offer Reconnect. Once the
// bank answers again, the next sync clears it.
const failSyncs = (request: import("@playwright/test").APIRequestContext, code: string | null) =>
  request.post(`${MOCK_PLAID_URL}/__mock/fail`, { data: { code } });

test("expired bank login shows Reconnect, then recovers", async ({ page, request }) => {
  await failSyncs(request, "ITEM_LOGIN_REQUIRED");
  try {
    const res = await request.post("/api/plaid/sync");
    expect(res.status()).toBe(502);
    const { errors } = await res.json();
    expect(errors).toEqual([expect.objectContaining({ error_code: "ITEM_LOGIN_REQUIRED" })]);
    expect(JSON.stringify(errors)).not.toMatch(/access-|secret/);

    const status = await (await request.get("/api/v1/status", { headers: bearer(tokens().read) })).json();
    expect(status.connections[0].lastErrorCode).toBe("ITEM_LOGIN_REQUIRED");

    await page.route((url) => !url.href.startsWith(MOCK_PLAID_URL) && !url.href.includes("127.0.0.1"), (r) => r.abort());
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
  } finally {
    await failSyncs(request, null);
  }

  expect((await request.post("/api/plaid/sync")).status()).toBe(200);
  const status = await (await request.get("/api/v1/status", { headers: bearer(tokens().read) })).json();
  expect(status.connections[0].lastErrorCode).toBeNull();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Reconnect" })).toHaveCount(0);
});
