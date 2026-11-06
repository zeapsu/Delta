// README and social preview screenshots from synthetic data.
// Usage: npm run build && npm run screenshots
// Runs the production build against a fresh DB (e2e/.tmp/demo.db) and the
// mock Plaid in demo mode (seven months of invented merchants), then writes
// docs/img/*.png. No Plaid keys or real data involved.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { chromium } from "@playwright/test";

const PORT = 3200;
const MOCK_PORT = 4020;
const DB = "e2e/.tmp/demo.db";
const OUT = "docs/img";
const base = `http://127.0.0.1:${PORT}`;

rmSync("e2e/.tmp/demo.db", { force: true });
rmSync("e2e/.tmp/demo.db-wal", { force: true });
rmSync("e2e/.tmp/demo.db-shm", { force: true });
mkdirSync("e2e/.tmp", { recursive: true });
mkdirSync(OUT, { recursive: true });

const env = {
  ...process.env,
  TZ: "UTC",
  DATABASE_PATH: DB,
  PLAID_ENV: "sandbox",
  PLAID_CLIENT_ID: "mock-client",
  PLAID_SANDBOX_SECRET: "mock-secret",
  PLAID_MOCK_URL: `http://127.0.0.1:${MOCK_PORT}`,
  PLAID_MOCK_DEMO: "1",
  DELTA_URL: base,
  DELTA_UPDATE_CHECK: "off",
};
const procs = [
  spawn("node", ["e2e/plaid-mock.mjs", String(MOCK_PORT)], { env, stdio: "ignore", detached: true }),
  spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(PORT)], { env, stdio: "ignore", detached: true }),
];
// Kill each process group: npx leaves next-server running otherwise.
const stop = () =>
  procs.forEach((p) => {
    try {
      process.kill(-p.pid);
    } catch {}
  });
process.on("exit", stop);

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function call(method, path, body) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
}

await waitFor(`http://127.0.0.1:${MOCK_PORT}/health`);
await waitFor(`${base}/`);

// Link (runs the first sync), then the state a few months of use leaves.
await call("POST", "/api/plaid/exchange", { public_token: "public-sandbox-mock", institution_name: "Demo Bank" });
await call("PUT", "/api/settings", {
  analysis: { baselineMonths: 3, spikePct: 25, spikeMinDollars: 50, trendMonths: 3, budgetWarnPct: 80 },
}); // hides the "choose how closely" prompt
for (const [category, dollars] of [
  ["FOOD_AND_DRINK", 900],
  ["GENERAL_MERCHANDISE", 250],
  ["TRANSPORTATION", 200],
  ["ENTERTAINMENT", 40],
]) {
  await call("POST", "/api/budgets", { category, monthlyAmount: dollars * 100 });
}

// Daily balance history so net worth has a trend: a steady climb with noise.
const db = new Database(DB);
const accts = db.prepare("SELECT id, plaid_account_id AS pid, current_balance AS bal FROM accounts").all();
const start = { "acc-checking": 3900, "acc-savings": 12600, "acc-card": 980, "acc-brokerage": 35200 };
const insert = db.prepare("INSERT INTO balance_snapshots (account_id, current_balance, snapshot_at) VALUES (?, ?, ?)");
const DAYS = 180;
db.transaction(() => {
  for (let d = DAYS; d >= 1; d--) {
    const t = (DAYS - d) / DAYS;
    for (const a of accts) {
      const from = start[a.pid] * 100;
      const noise = (Math.sin(d / 6 + a.id) + 0.4 * Math.sin(d / 2.3)) * 0.006 * a.bal;
      insert.run(a.id, Math.round(from + (a.bal - from) * t + noise), Date.now() - d * 86_400_000);
    }
  }
})();
db.close();

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function shot(path, file, scheme, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: opts.height ?? 900 }, colorScheme: scheme, deviceScaleFactor: 2 });
  await page.route((u) => !u.href.startsWith(base), (r) => r.abort()); // no Plaid Link script
  await page.goto(base + path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800); // chart animations
  await page.screenshot({ path: `${OUT}/${file}` });
  await page.close();
}
for (const scheme of ["light", "dark"]) {
  await shot("/", `overview-${scheme}.png`, scheme);
}
const lastMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
await shot(`/spending?month=${lastMonth}`, "spending-light.png", "light");

// GitHub social preview, 1280x640: title + tagline beside the overview.
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>
  body { margin: 0; width: 1280px; height: 640px; overflow: hidden; background: #0a0a0a; color: #fafafa;
         font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; position: relative; }
  .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; }
  .logo { width: 64px; height: 64px; border-radius: 50%; background: #fafafa; color: #0a0a0a; display: grid; place-items: center; font-size: 34px; font-weight: 700; }
  h1 { font-size: 88px; letter-spacing: -3px; margin: 28px 0 12px; }
  p { font-size: 30px; line-height: 1.3; color: #a3a3a3; margin: 0; }
  .chips { margin-top: 32px; display: flex; gap: 10px; flex-wrap: wrap; }
  .chips span { border: 1px solid #333; border-radius: 999px; padding: 8px 16px; font-size: 20px; color: #d4d4d4; }
  img { position: absolute; left: 580px; top: 70px; width: 900px; border-radius: 18px; border: 1px solid #262626;
        box-shadow: 0 30px 80px rgba(0,0,0,.6); }
</style></head><body>
  <div class="text"><div class="logo">Δ</div><h1>Delta</h1>
  <p>Self-hosted personal finance your own AI agent can talk to.</p>
  <div class="chips"><span>Plaid</span><span>SQLite</span><span>MCP</span><span>Docker</span></div></div>
  <img src="data:image/png;base64,${(await import("node:fs")).readFileSync(`${OUT}/overview-dark.png`).toString("base64")}">
</body></html>`);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/social-preview.png` });

await browser.close();
stop();
console.log(`wrote ${OUT}/overview-light.png, overview-dark.png, spending-light.png, social-preview.png`);
