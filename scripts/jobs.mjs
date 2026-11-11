// Periodic jobs for the Docker image, the counterpart of the delta-sync and
// delta-backup systemd timers on bare metal: every SYNC_INTERVAL_HOURS (6)
// ask Plaid to refresh, wait REFRESH_WAIT_SECONDS (180), then sync; every
// BACKUP_INTERVAL_HOURS (24) run scripts/backup-db.mjs. Runs as its own
// compose service sharing the app's network namespace, so it reaches the app
// on loopback (which the API guard always allows). Plain node, no deps.
import { spawn } from "node:child_process";

const URL_BASE = (process.env.DELTA_INTERNAL_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
// An empty or mistyped value ("", "6h") must not become a 0 ms interval: that
// loops backups and Plaid refreshes (billed per call on paid plans) without a
// pause. Fall back to the default, and stay inside what setTimeout can hold
// (a longer delay fires at once).
const MAX_DELAY = 2 ** 31 - 1;
function interval(name, def, unitMs, minMs) {
  const raw = process.env[name]?.trim();
  let n = raw ? Number(raw) : def;
  if (!Number.isFinite(n) || n < 0 || (n === 0 && minMs > 0)) {
    console.warn(`jobs: ${name}=${JSON.stringify(raw)} is not a usable number, using ${def}`);
    n = def;
  }
  return Math.min(Math.max(n * unitMs, minMs), MAX_DELAY);
}
const SYNC_EVERY = interval("SYNC_INTERVAL_HOURS", 6, 3600_000, 60_000);
const BACKUP_EVERY = interval("BACKUP_INTERVAL_HOURS", 24, 3600_000, 60_000);
const REFRESH_WAIT = interval("REFRESH_WAIT_SECONDS", 180, 1000, 0);

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path) {
  const res = await fetch(`${URL_BASE}${path}`, { method: "POST" });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body: body.slice(0, 500) };
}

async function waitForApp() {
  for (;;) {
    try {
      await fetch(`${URL_BASE}/api/v1`);
      return;
    } catch {
      await sleep(5000);
    }
  }
}

async function sync() {
  try {
    const refresh = await post("/api/plaid/refresh");
    log(`refresh ${refresh.status}`, refresh.body);
  } catch (err) {
    log("refresh failed (syncing anyway):", err.message);
  }
  await sleep(REFRESH_WAIT);
  try {
    const res = await post("/api/plaid/sync");
    log(`sync ${res.status}`, res.body);
  } catch (err) {
    log("sync failed:", err.message);
  }
}

function backup() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/backup-db.mjs"], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code !== 0) log(`backup exited ${code}`);
      resolve();
    });
  });
}

// Self-rescheduling loop: a slow run delays the next one instead of overlapping.
async function every(ms, job) {
  for (;;) {
    await job();
    await sleep(ms);
  }
}

await waitForApp();
log(`jobs: sync every ${SYNC_EVERY / 3600_000}h, backup every ${BACKUP_EVERY / 3600_000}h, app at ${URL_BASE}`);
every(BACKUP_EVERY, backup);
every(SYNC_EVERY, sync);
