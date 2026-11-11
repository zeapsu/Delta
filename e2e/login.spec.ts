import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { expect, request as newRequest, test } from "@playwright/test";
import { apiRoutes, bearer, tokens } from "./helpers";

// The web UI password: runs last (every other project is a dependency), since
// turning it on locks the shared server, and turns it off again at the end.
const PASSWORD = randomBytes(12).toString("base64url");
const OTHER = randomBytes(12).toString("base64url");

test("password locks pages and dashboard routes, not agents or the sync timer", async ({ page, baseURL }, info) => {
  const owner = await newRequest.newContext({ baseURL });
  const on = await owner.put("/api/settings/password", { data: { password: PASSWORD } });
  expect(on.status()).toBe(200);
  // Changing it needs the current one, and agents can't touch it.
  expect((await owner.put("/api/settings/password", { data: { password: OTHER } })).status()).toBe(403);
  expect(
    (await owner.put("/api/settings/password", { data: { password: OTHER, current: PASSWORD }, headers: bearer(tokens().write) })).status(),
  ).toBe(403);

  const stranger = await newRequest.newContext({ baseURL });
  expect((await stranger.get("/api/budgets")).status()).toBe(401);
  // Every dashboard route, from the source tree, so new ones are covered too.
  for (const route of apiRoutes().filter((r) => !r.startsWith("/api/v1"))) {
    expect((await stranger.get(route)).status(), route).toBe(401);
    expect((await stranger.get(`${route}.0`)).status(), `${route}.0`).toBe(401);
  }
  expect((await stranger.delete("/api/tokens/1.0")).status()).toBe(401);
  expect((await stranger.get("/settings", { maxRedirects: 0 })).headers().location).toContain("/login?next=%2Fsettings");
  expect((await stranger.get("/api/v1/status", { headers: bearer(tokens().read) })).status()).toBe(200);
  expect((await stranger.post("/api/v1/mcp", { headers: bearer(tokens().read), data: { jsonrpc: "2.0", id: 1, method: "ping" } })).status()).toBe(200);
  expect((await stranger.post("/api/plaid/sync")).status()).not.toBe(401);
  // The owner's session cookie still works.
  expect((await owner.get("/api/budgets")).status()).toBe(200);

  // Logging out ends every session, so a copy of the cookie is worth nothing
  // afterwards. Only someone logged in can do that.
  const second = await newRequest.newContext({ baseURL });
  expect((await second.post("/api/auth/login", { data: { password: PASSWORD } })).status()).toBe(200);
  const copy = (await second.storageState()).cookies.find((c) => c.name === "delta_session")!.value;
  expect((await stranger.post("/api/auth/logout")).status()).toBe(200);
  expect((await owner.get("/api/budgets")).status()).toBe(200);
  expect((await second.post("/api/auth/logout")).status()).toBe(200);
  expect((await second.get("/api/budgets")).status()).toBe(401);
  expect((await owner.get("/api/budgets")).status()).toBe(401);
  expect((await stranger.get("/api/budgets", { headers: { cookie: `delta_session=${copy}` } })).status()).toBe(401);

  await page.goto("/spending");
  await expect(page).toHaveURL(/\/login\?next=%2Fspending/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.getByLabel("Password").fill(OTHER);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("status")).toHaveText("Wrong password");
  await info.attach("login", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/spending$/);
  await expect(page.locator("h1").first()).toHaveText(/Spending/);

  await page.goto("/settings#password");
  await expect(page.getByText("On. Each device stays logged in for 30 days.")).toBeVisible();
  await page.getByRole("button", { name: "Turn off" }).click();
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("Off. Anyone who can reach Delta can open it.")).toBeVisible();
  expect((await stranger.get("/api/budgets")).status()).toBe(200);
});
