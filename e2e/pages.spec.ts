import { expect, test } from "@playwright/test";

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
  });
}

test("no horizontal scroll at phone width", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  for (const [path] of PAGES) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test("spending shows the fixture's categories", async ({ page }) => {
  await page.goto("/spending");
  await expect(page.getByText(/Food and drink/i).first()).toBeVisible();
  await expect(page.getByText(/Entertainment/i).first()).toBeVisible();
});
