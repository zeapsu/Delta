import { expect, test } from "@playwright/test";

// A one-click install's first visit: no Plaid keys anywhere, so the welcome
// page sends you to /setup, where pasted keys are checked with Plaid (the
// mock rejects "rejected-secret") and saved, and Link becomes available.
test("paste Plaid keys on the setup page", async ({ page, request }) => {
  const local = (url: string) => url.startsWith("http://127.0.0.1");
  await page.route((url) => !local(url.href), (route) => route.abort());

  await page.goto("/");
  await expect(page.getByText("Welcome to Delta")).toBeVisible();
  await page.getByRole("link", { name: "Set up Plaid" }).click();
  await expect(page.locator("h1")).toHaveText("Set up Delta");

  expect(await (await request.get("/api/settings/plaid")).json()).toEqual({
    source: "none",
    env: "sandbox",
    clientId: null,
    configured: false,
  });

  await page.getByLabel("client_id").fill("test-client-id-0001");
  await page.getByLabel("Sandbox secret").fill("rejected-secret");
  await page.getByRole("button", { name: "Check and save" }).click();
  await expect(page.getByRole("status")).toContainText("INVALID_API_KEYS");

  await page.getByLabel("Sandbox secret").fill("test-secret-value-0001");
  await page.getByRole("button", { name: "Check and save" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Plaid sandbox: keys OK")).toBeVisible();
  await expect(page.getByRole("button", { name: /Connect account/ })).toBeVisible();

  // Saved keys never come back out, only a hint.
  const status = await (await request.get("/api/settings/plaid")).json();
  expect(status).toEqual({ source: "setup", env: "sandbox", clientId: "test…0001", configured: true });

  // And they drive Plaid: linking works on this install.
  const res = await request.post("/api/plaid/exchange", {
    data: { public_token: "public-sandbox-mock", institution_name: "Mock Bank" },
  });
  expect(res.status()).toBe(200);

  // With a bank linked, the environment can't flip to production.
  const flip = await request.put("/api/settings/plaid", {
    data: { env: "production", clientId: "test-client-id-0001", secret: "test-secret-value-0001" },
  });
  expect(flip.status()).toBe(409);
});
