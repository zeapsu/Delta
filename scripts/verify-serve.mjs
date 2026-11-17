// A seeded Delta to try a change against, for the verify skill
// (.claude/skills/verify/SKILL.md) and for anyone checking a change by hand.
// Usage: npm run build && node scripts/verify-serve.mjs [--dev] [--demo]
//   --dev   next dev instead of the production build (no build step, slower pages)
//   --demo  the mock's fuller seven-month fixture instead of the e2e one
// Starts the mock Plaid and the app on a fresh DB (e2e/.tmp/verify.db), links
// the mock bank (which runs the first sync), mints a write token, prints the
// URL and token, and runs until stopped. No Plaid keys or real data involved.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const PORT = 3300;
const MOCK_PORT = 4030;
const DB = "e2e/.tmp/verify.db";
const base = `http://127.0.0.1:${PORT}`;
const dev = process.argv.includes("--dev");

for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) rmSync(f, { force: true });
mkdirSync("e2e/.tmp", { recursive: true });

const env = {
  ...process.env,
  TZ: process.env.TZ ?? "UTC", // the e2e fixture is dated in UTC
  DATABASE_PATH: DB,
  PLAID_ENV: "sandbox",
  PLAID_CLIENT_ID: "mock-client",
  PLAID_SANDBOX_SECRET: "mock-secret",
  PLAID_MOCK_URL: `http://127.0.0.1:${MOCK_PORT}`,
  PLAID_MOCK_DEMO: process.argv.includes("--demo") ? "1" : "",
  DELTA_URL: base,
  DELTA_UPDATE_CHECK: "off",
  REFRESH_WAIT_SECONDS: "3600", // no follow-up sync landing mid-check
};
const procs = [
  spawn("node", ["e2e/plaid-mock.mjs", String(MOCK_PORT)], { env, stdio: "ignore", detached: true }),
  spawn("npx", ["next", dev ? "dev" : "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    env,
    stdio: ["ignore", "ignore", "inherit"],
    detached: true,
  }),
];
// Kill each process group: npx leaves next-server running otherwise.
const stop = () =>
  procs.forEach((p) => {
    try {
      process.kill(-p.pid);
    } catch {}
  });
process.on("exit", stop);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));
for (const p of procs) p.on("exit", (code) => code && (console.error(`a server exited with ${code}`), process.exit(1)));

async function waitFor(url) {
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

await waitFor(`http://127.0.0.1:${MOCK_PORT}/health`);
await waitFor(`${base}/`);

const res = await fetch(`${base}/api/plaid/exchange`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ public_token: "public-sandbox-mock", institution_name: "Mock Bank" }),
});
if (!res.ok) throw new Error(`link: ${res.status} ${await res.text()}`);

const out = execFileSync("npx", ["tsx", "scripts/api-token.ts", "create", "verify", "--scope", "write"], {
  env,
  encoding: "utf8",
});
const token = out.match(/dlt_[A-Za-z0-9_-]+/)?.[0];

console.log(`Delta (${dev ? "dev" : "build"}) at ${base}, seeded with the mock bank`);
console.log(`DB ${DB}  token (write) ${token}`);
console.log(`MCP: ${base}/api/v1/mcp with Authorization: Bearer ${token}`);
console.log("ready");
