import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { layoutProblems } from "./layout";

// Visual QA smoke: every page renders with data, without server or browser
// errors. Full-page screenshots go into the HTML report for a human look
// (desktop/light and phone/dark); they are not pixel-diffed, since the
// fixture is dated relative to today.
const PAGES: [string, RegExp][] = [
  ["/", /./],
  ["/spending", /Spending/],
  ["/transactions", /Transactions/],
  ["/budgets", /Budgets/],
  ["/recurring", /Recurring/],
  ["/net-worth", /Net worth/],
  ["/investments", /Investments/],
  ["/settings", /Settings/],
  ["/setup", /Plaid keys/],
];

for (const [path, heading] of PAGES) {
  test(`renders ${path}`, async ({ page, baseURL }, info) => {
    // Third parties (Plaid Link's script) are out of scope and not reachable
    // from every runner: block them, and ignore the console noise that causes.
    const local = (url: string) => url.startsWith(baseURL!);
    await page.route((url) => !local(url.href), (route) => route.abort());
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && (local(m.location().url) || !m.text().startsWith("Failed to load resource"))) {
        errors.push(`${m.text()} (${m.location().url})`);
      }
    });

    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toHaveText(heading);
    await expect(page.getByText("Application error")).toHaveCount(0);
    // The page is not the empty welcome state: the fixture is linked.
    await expect(page.getByText("Welcome to Delta")).toHaveCount(0);
    await page.waitForLoadState("networkidle");

    await info.attach(`${info.project.name}${path.replace(/\//g, "_")}.png`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    expect(errors).toEqual([]);

    // Accessibility (WCAG 2.1 A/AA rules axe can check automatically).
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const found = axe.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}x ${v.help} e.g. ${v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160)).join(' | ')}`);
    expect(found).toEqual([]);
  });
}

// Layout, at the project's own width and, on phones, at the narrowest ones in
// use (320 and 375). Beyond a screenshot: see e2e/layout.ts for the rules.
const NARROW = [320, 375];
const STATES: [string, string, ((page: Page) => Promise<void>)?][] = [
  ...PAGES.map(([path]): [string, string] => [path, path]),
  ["/transactions with filters", "/transactions?q=coffee&from=2020-01-01&to=2030-12-31&category=FOOD_AND_DRINK"],
  [
    "/transactions category picker",
    "/transactions",
    async (page) => {
      // The table renders a phone and a desktop cell per row; click the shown one.
      await page.getByTitle("Change category").filter({ visible: true }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  ],
  [
    "/recurring confirm form",
    "/recurring",
    async (page) => {
      const yes = page.getByRole("button", { name: "Yes, track it" }).filter({ visible: true }).first();
      if (await yes.count()) await yes.click();
    },
  ],
];

test("nothing overflows the screen or its card, and fields don't trigger iOS zoom", async ({ page, viewport }, info) => {
  const phone = (viewport?.width ?? 1280) < 640;
  const widths = phone ? [...NARROW, viewport!.width] : [viewport?.width ?? 1280];
  const found: string[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: viewport?.height ?? 800 });
    for (const [label, path, prepare] of STATES) {
      await page.goto(path);
      await prepare?.(page);
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const problems = await layoutProblems(page);
      if (scroll > 1) problems.unshift(`the page scrolls sideways by ${scroll}px`);
      if (problems.length) {
        await info.attach(`layout ${label.replace(/\W+/g, "_")} ${width}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      }
      found.push(...problems.map((p) => `${label} at ${width}px: ${p}`));
    }
  }
  expect(found).toEqual([]);
});

test("spending shows the fixture's categories", async ({ page }) => {
  await page.goto("/spending");
  await expect(page.getByText(/Food and drink/i).first()).toBeVisible();
  await expect(page.getByText(/Entertainment/i).first()).toBeVisible();
});

test("Settings → Agents creates a token with a ready config, then revokes it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/settings");
  const agents = page.locator("#agents");
  await agents.getByLabel("New agent").fill("ui-agent");
  await agents.getByRole("radio", { name: /Read \+ edit/ }).click();
  await agents.getByRole("button", { name: "Create token" }).click();
  await expect(agents.getByText("ui-agent is ready")).toBeVisible();
  await expect(agents.locator("pre")).toContainText("/api/v1/mcp");
  await expect(agents.locator("pre")).toContainText("dlt_");
  await agents.getByRole("button", { name: "JSON config" }).click();
  await expect(agents.locator("pre")).toContainText('"mcpServers"');
  await info.attach("agents-created.png", { body: await agents.screenshot(), contentType: "image/png" });
  await agents.getByRole("button", { name: "Done" }).click();

  await agents.getByRole("button", { name: "Revoke ui-agent" }).click();
  await agents.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(agents.getByText("ui-agent")).toHaveCount(0);
});
