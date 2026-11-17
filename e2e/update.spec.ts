import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { layoutProblems } from "./layout";

// The header's Update pill and its dialog, on the fresh server (it checks for
// updates against the mock's fake GitHub, which always has v9.9.9 two commits
// ahead). The Docker updater is played by this test: it writes the status
// file the way scripts/updater.mjs does and looks for the request file.
const DIR = "e2e/.tmp/update";
const BACKUPS = "e2e/.tmp/backups";

const status = (state: string, extra: Record<string, unknown> = {}) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/status.json`, JSON.stringify({ state, at: Date.now(), ...extra }));
};
const noUpdater = () => rmSync(`${DIR}/status.json`, { force: true });
const noRequest = () => rmSync(`${DIR}/request`, { force: true });
test.beforeEach(() => {
  noUpdater();
  noRequest();
});
test.afterAll(() => {
  noUpdater();
  noRequest();
});

// The first render has no answer yet (the check runs in the background), so
// reload until the pill shows.
async function openDialog(page: Page) {
  await page.goto("/");
  const pill = page.getByRole("button", { name: /^Update:/ }).filter({ visible: true });
  await expect(async () => {
    await page.reload();
    await expect(pill).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await pill.click();
  const dialog = page.getByRole("dialog", { name: "Update Delta" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(450); // the sheet's slide-in
  return dialog;
}

async function seen(page: Page, label: string) {
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(" | ")}`), `axe, ${label}`).toEqual([]);
  expect(await layoutProblems(page), `layout, ${label}`).toEqual([]);
}

const WIDTHS = [1280, 375, 320];

test("the dialog hands over the command when no updater runs", async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const dialog = await openDialog(page);
    await expect(dialog.getByText("v9.9.9")).toBeVisible();
    await expect(dialog.getByRole("link", { name: /What's new/ })).toHaveAttribute("href", "https://github.com/zeapsu/Delta/releases/tag/v9.9.9");
    await expect(dialog.getByText("./delta.sh update")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Update now" })).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: /Update from the app next time/ })).toHaveAttribute("href", /updating#update-from-the-app$/);
    await seen(page, `no updater, ${width}px`);
  }
});

test("Update now backs up, asks the updater and follows the status to done", async ({ page }) => {
  for (const width of WIDTHS.slice(0, 2)) {
    status("idle");
    await page.setViewportSize({ width, height: 800 });
    const dialog = await openDialog(page);
    await expect(dialog.getByText("./delta.sh update")).toHaveCount(0);
    await seen(page, `idle with updater, ${width}px`);

    const posted = page.waitForResponse((r) => r.url().endsWith("/api/update") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Update now" }).click();
    const res = await posted;
    expect(res.status()).toBe(202);
    const { requestedAt } = await res.json();
    expect(existsSync(`${DIR}/request`)).toBe(true);
    expect(readdirSync(BACKUPS).some((f) => /^delta-\d{4}-\d{2}-\d{2}-pre-update-\d{6}\.db$/.test(f))).toBe(true);

    const live = dialog.getByRole("status");
    const steps = dialog.getByRole("listitem");
    await expect(steps).toHaveText([/Back up/, /Download/, /Restart/]);
    await expect(steps.nth(0)).toContainText("(done)");
    status("pulling", { requestedAt });
    await expect(live).toHaveText("Download and verify…");
    await seen(page, `updating, ${width}px`);
    status("restarting", { requestedAt });
    await expect(live).toHaveText("Restart…");
    await expect(steps.nth(1)).toContainText("(done)");
    expect(await page.evaluate(() => document.body.innerText)).toContain("Restart");

    await Promise.all([page.waitForEvent("load"), status("done", { requestedAt, from: "aaaaaaaaaaaa", to: "bbbbbbbbbbbb" })]);
    noRequest();
  }
});

test("a failed update says so and falls back to the command", async ({ page }) => {
  status("idle");
  const dialog = await openDialog(page);
  const posted = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/update"));
  await dialog.getByRole("button", { name: "Update now" }).click();
  const { requestedAt } = await (await posted).json();
  status("pulling", { requestedAt });
  // The updater's message when a new image's signature doesn't check out (scripts/updater.mjs).
  const refused = "The new version's signature didn't check out, so it wasn't installed.";
  status("failed", { requestedAt, message: refused });
  await expect(dialog.getByRole("status")).toHaveText(refused);
  await expect(dialog.getByText("./delta.sh update")).toBeVisible();
  await expect(dialog.getByRole("listitem").nth(1)).toContainText("(needs attention)");
  await seen(page, "failed");
});

test("a state left by an earlier update doesn't show up as this one's", async ({ page }) => {
  status("done", { requestedAt: 1 });
  const dialog = await openDialog(page);
  await expect(dialog.getByRole("button", { name: "Update now" })).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(0);
});

test("updating is for the dashboard: a token is refused, and nothing runs without an updater", async ({ request }) => {
  status("idle");
  const made = await request.post("/api/tokens", { data: { name: "update-test", scope: "write" } });
  const { token } = await made.json();
  const refused = await request.post("/api/update", { headers: { authorization: `Bearer ${token}` } });
  expect(refused.status()).toBe(403);
  expect(existsSync(`${DIR}/request`)).toBe(false);
  expect((await request.post("/api/update", { headers: { authorization: "Bearer x" } })).status()).toBe(401);

  noUpdater();
  const none = await request.post("/api/update");
  expect(none.status()).toBe(409);
  expect(await (await request.get("/api/update")).json()).toMatchObject({ available: false });
});
