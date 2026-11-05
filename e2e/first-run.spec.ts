import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const axe = async (page: import("@playwright/test").Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(" | ")}`,
  );

// A home server app install's first visit: no Plaid keys anywhere, so the
// welcome cards ask for a name, then the keys, which are checked with Plaid
// (the mock rejects "rejected-secret") and saved, and Link becomes available.
test("welcome cards: name, Plaid keys, then Link", async ({ page, request }) => {
  const local = (url: string) => url.startsWith("http://127.0.0.1");
  await page.route((url) => !local(url.href), (route) => route.abort());

  await page.goto("/");
  await expect(page.getByText("Welcome to Delta")).toBeVisible();
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
});
