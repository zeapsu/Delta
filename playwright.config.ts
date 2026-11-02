import { defineConfig, devices } from "@playwright/test";

// End-to-end suite: the production build (`npm run build` first) against a
// fresh DB and a mock Plaid (e2e/plaid-mock.mjs), so it needs no Plaid keys
// and never touches real data. Run: npm run build && npm run e2e
const PORT = 3100;
const MOCK_PORT = 4010;
export const DB_PATH = "e2e/.tmp/delta-e2e.db";

const env = {
  TZ: "UTC", // the fixture is dated in UTC
  DATABASE_PATH: DB_PATH,
  PLAID_ENV: "sandbox",
  PLAID_CLIENT_ID: "mock-client",
  PLAID_SANDBOX_SECRET: "mock-secret",
  PLAID_MOCK_URL: `http://127.0.0.1:${MOCK_PORT}`,
  DELTA_URL: `http://127.0.0.1:${PORT}`,
  DELTA_UPDATE_CHECK: "off", // no GitHub calls, no update pill in screenshots
};
// The token CLI (e2e/setup.spec.ts) and the server must share the DB.
Object.assign(process.env, env);

// A second server like a one-click install: no Plaid keys in its environment
// (they get pasted on /setup) and its own empty DB. Blank, not omitted:
// webServer env is merged over process.env, which carries the keys above.
export const FRESH_PORT = 3101;
const freshEnv = { ...env, PLAID_CLIENT_ID: "", PLAID_SANDBOX_SECRET: "" };

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.tmp/results",
  fullyParallel: false,
  workers: 1, // one shared DB; specs build on the seeded state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "e2e/.tmp/report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "e2e/.tmp/report", open: "never" }]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /setup\.spec\.ts/ },
    { name: "api", testMatch: /(api|mcp|reauth)\.spec\.ts/, dependencies: ["setup"] },
    { name: "first-run", testMatch: /first-run\.spec\.ts/, use: { baseURL: `http://127.0.0.1:${FRESH_PORT}` } },
    {
      name: "desktop",
      testMatch: /pages\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
    {
      name: "phone",
      testMatch: /pages\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], colorScheme: "dark" },
    },
  ],
  webServer: [
    {
      command: `node e2e/plaid-mock.mjs ${MOCK_PORT}`,
      url: `http://127.0.0.1:${MOCK_PORT}/health`,
      reuseExistingServer: false,
    },
    {
      // Fresh DB every run; migrations apply on the first request.
      command: `rm -rf e2e/.tmp/delta-e2e.db* && mkdir -p e2e/.tmp && npx next start -H 127.0.0.1 -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}/`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `rm -rf e2e/.tmp/fresh.db* && mkdir -p e2e/.tmp && npx next start -H 127.0.0.1 -p ${FRESH_PORT}`,
      url: `http://127.0.0.1:${FRESH_PORT}/`,
      env: { ...freshEnv, DATABASE_PATH: "e2e/.tmp/fresh.db", DELTA_URL: `http://127.0.0.1:${FRESH_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
