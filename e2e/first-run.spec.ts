import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { MOCK_ACCESS_TOKEN, MOCK_PLAID_URL } from "./helpers";

// Saving a step refreshes the page, and until the refreshed metadata arrives
// the document has no <title> (measured: gone for about 300ms). A scan in
// that window reports "document-title" on a page that has one, so scan until
// it comes back clean. A real violation stays and still fails after 5s.
const axe = async (page: import("@playwright/test").Page) => {
  let found: string[] = [];
  await expect(async () => {
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    found = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(" | ")}`);
    expect(found).toEqual([]);
  })
    .toPass({ timeout: 5000 })
    .catch(() => {});
  return found;
};

// A home server app install's first visit: no Plaid keys anywhere, so the
// welcome cards ask for a name, then the keys, which are checked with Plaid
// (the mock rejects "rejected-secret") and saved, and Link becomes available.
test("welcome cards: name, Plaid keys, then Link", async ({ page, request }) => {
  const local = (url: string) => url.startsWith("http://127.0.0.1");
  await page.route((url) => !local(url.href), (route) => route.abort());

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to Delta" })).toBeVisible();
  await expect(page.getByText("Step 1 of 3")).toBeAttached();
  expect(await axe(page)).toEqual([]);
  await page.getByLabel("Your name").fill("Sam");
  await page.getByLabel("Your name").press("Enter");
  await expect(page.getByRole("heading", { name: "Add your Plaid keys" })).toBeVisible();

  expect(await (await request.get("/api/settings/plaid")).json()).toEqual({
    source: "none",
    env: "sandbox",
    clientId: null,
    configured: false,
  });

  await page.getByLabel("client_id").fill("test-client-id-0001");
  await page.getByLabel("Sandbox secret").fill("rejected-secret");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("INVALID_API_KEYS");

  await page.getByLabel("Sandbox secret").fill("test-secret-value-0001");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect a bank" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Connect account/ })).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // Back walks the cards in reverse, with what was saved filled in.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Your name")).toHaveValue("Sam");

  // Saved keys never come back out, only a hint.
  const status = await (await request.get("/api/settings/plaid")).json();
  expect(status).toEqual({ source: "setup", env: "sandbox", clientId: "test…0001", configured: true });

  // And they drive Plaid: linking works on this install.
  const res = await request.post("/api/plaid/exchange", {
    data: { public_token: "public-sandbox-mock", institution_name: "Mock Bank" },
  });
  expect(res.status()).toBe(200);

  // Overview then walks the rest: history in, watch level and agent to go.
  await page.goto("/");
  await expect(page.locator("h1")).toContainText(", Sam");
  const checklist = page.locator("section", { has: page.getByRole("heading", { name: "Getting started" }) });
  await expect(checklist).toBeVisible();
  await expect(checklist.getByRole("listitem").filter({ hasText: "Pull your history" })).toContainText("(done)");
  await expect(checklist.getByRole("link", { name: "Choose", exact: true })).toBeVisible();

  // With a bank linked, the environment can't flip to production.
  const flip = await request.put("/api/settings/plaid", {
    data: { env: "production", clientId: "test-client-id-0001", secret: "test-secret-value-0001" },
  });
  expect(flip.status()).toBe(409);

  // Removing the connection. If Plaid refuses, nothing is deleted: the item
  // would stay billed there with no token left to remove it.
  const fail = (code: string | null) =>
    request.post(`${MOCK_PLAID_URL}/__mock/fail`, { data: { code, path: "/item/remove" } });
  const remove = (item_id: number) => request.delete("/api/plaid/items", { data: { item_id } });
  await fail("INTERNAL_SERVER_ERROR");
  const refused = await remove(1);
  expect(refused.status()).toBe(502);
  expect((await refused.json()).error_code).toBe("INTERNAL_SERVER_ERROR");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();

  // Removed at Plaid, then here: with no bank left, the welcome page is back.
  await fail(null);
  expect(await (await remove(1)).json()).toEqual({ ok: true });
  const { removed } = await (await request.post(`${MOCK_PLAID_URL}/__mock/removed`)).json();
  expect(removed).toContain(MOCK_ACCESS_TOKEN);
  expect((await remove(1)).status()).toBe(404);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Getting started" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Connect a bank" })).toBeVisible();

  // A connection Plaid no longer has can still be removed here.
  const again = await request.post("/api/plaid/exchange", {
    data: { public_token: "public-sandbox-mock", institution_name: "Mock Bank" },
  });
  expect(again.status()).toBe(200);
  await fail("ITEM_NOT_FOUND");
  expect((await remove(2)).status()).toBe(200);
  await fail(null);
  expect((await remove(2)).status()).toBe(404);

  // Leave a bank linked for whatever runs after this on the first-run server.
  const last = await request.post("/api/plaid/exchange", {
    data: { public_token: "public-sandbox-mock", institution_name: "Mock Bank" },
  });
  expect(last.status()).toBe(200);
});

// The bank linked above is removed from its card: "⋯" opens the sheet, and
// the removal sits behind a second step that says what is deleted. With no
// connection left, the welcome cards come back.
test("a connection is removed from its card, behind a confirm", async ({ page, request }) => {
  const local = (url: string) => url.startsWith("http://127.0.0.1");
  await page.route((url) => !local(url.href), (route) => route.abort());

  await page.goto("/");
  await page.getByRole("button", { name: "Manage Mock Bank" }).click();
  const sheet = page.getByRole("dialog", { name: "Manage Mock Bank" });
  await expect(sheet.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Remove connection" }).click();
  await expect(sheet).toContainText("Remove Mock Bank?");
  expect(await axe(page)).toEqual([]);

  // Cancel leaves it alone.
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { name: "Mock Bank" })).toBeVisible();

  // Plaid refuses: the sheet stays open and says nothing was deleted.
  const fail = (code: string | null) =>
    request.post(`${MOCK_PLAID_URL}/__mock/fail`, { data: { code, path: "/item/remove" } });
  await fail("INTERNAL_SERVER_ERROR");
  await page.getByRole("button", { name: "Manage Mock Bank" }).click();
  await sheet.getByRole("button", { name: "Remove connection" }).click();
  await sheet.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(sheet).toContainText("Nothing was deleted");
  await fail(null);

  await sheet.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Delta" })).toBeVisible();
});
