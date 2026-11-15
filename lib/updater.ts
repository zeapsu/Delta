import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { deriveBrewStatus, updateDir } from "../scripts/updater-lib.mjs";
import { ensureDir, readStatus, writeStatus } from "../scripts/updater-status.mjs";

// The app's side of "Update from the app" (docs/updating.md). It never touches
// Docker or Homebrew itself; it only asks, and reads how it is going from
// <data dir>/update/status.json. Two backends behind one contract:
//  - Docker (default): the opt-in `updater` compose service (scripts/updater.mjs)
//    polls for a `request` file in that directory. The app never gets the
//    Docker socket.
//  - Homebrew (DELTA_INSTALL=brew): the app starts scripts/brew-update.mjs,
//    which runs `brew upgrade delta` and stops the service so brew services
//    restarts it. Only when the service is supervised.

export type UpdaterStatus = {
  available: boolean;
  state: string;
  message?: string;
  at: number;
  requestedAt?: number;
};

const FRESH_MS = 90_000;
const brewInstall = () => process.env.DELTA_INSTALL === "brew";

function executable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

// The brew binary: DELTA_BREW (tests), else the prefix this app was installed
// under (<prefix>/Cellar/delta/<version>/libexec), else the usual ones.
export function brewBinary(): string | null {
  const override = process.env.DELTA_BREW;
  if (override) return path.isAbsolute(override) && executable(override) ? override : null;
  const prefixes: string[] = [];
  const m = /^(.*)\/Cellar\/delta\/[^/]+\/libexec(\/|$)/.exec(process.cwd());
  if (m) prefixes.push(m[1]);
  if (process.env.HOMEBREW_PREFIX) prefixes.push(process.env.HOMEBREW_PREFIX);
  prefixes.push("/opt/homebrew", "/usr/local", "/home/linuxbrew/.linuxbrew");
  for (const p of prefixes) if (executable(path.join(p, "bin/brew"))) return path.join(p, "bin/brew");
  return null;
}

// Only a supervised service comes back by itself after it is stopped.
function supervised(): boolean {
  const launchd = process.env.XPC_SERVICE_NAME?.startsWith("homebrew.mxcl.delta");
  const pid = Number(process.env.DELTA_LAUNCHER_PID);
  return !!(launchd || process.env.INVOCATION_ID) && Number.isInteger(pid) && pid > 1;
}

const brewReady = () => !!process.env.DELTA_COMMIT && supervised() && brewBinary() !== null;

export function readUpdaterStatus(): UpdaterStatus {
  const dir = updateDir();
  const s = readStatus(dir) as Raw | null;
  if (brewInstall()) {
    return { ...pick(deriveBrewStatus(s ?? { state: "idle", at: 0 }, process.env.DELTA_COMMIT) as Raw), available: brewReady() };
  }
  return { ...pick(s ?? { state: "idle", at: 0 }), available: !!s && Date.now() - s.at < FRESH_MS };
}

type Raw = { state: string; at: number; requestedAt?: number; message?: string };
function pick(s: Raw) {
  return { state: s.state, at: s.at, message: s.message, requestedAt: s.requestedAt };
}

// Asks for an update (the caller checked availability and made the backup).
// Returns the time of the request, on this machine's clock, which the status
// then carries as requestedAt.
export function requestUpdate(): number {
  const dir = updateDir();
  const requestedAt = Date.now();
  if (!brewInstall()) {
    // The updater makes the directory; without it there is nothing to ask.
    if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error("no updater");
    fs.writeFileSync(path.join(dir, "request"), "", { mode: 0o644 });
    return requestedAt;
  }

  const brew = brewBinary();
  if (!brew) throw new Error("no brew");
  ensureDir(dir, 0o700);
  // Visible at once, before the helper has started.
  writeStatus(dir, "pulling", { requestedAt, message: undefined, from: undefined, to: undefined }, 0o700);
  const log = fs.openSync(path.join(dir, "brew.log"), "a", 0o600);
  try {
    const env: Record<string, string | undefined> = {
      PATH: `${path.dirname(brew)}${path.delimiter}${process.env.PATH ?? ""}`,
      DELTA_BREW: brew,
      DELTA_UPDATE_DIR: dir,
      DELTA_SERVICE_PID: process.env.DELTA_LAUNCHER_PID ?? "",
      DELTA_COMMIT: process.env.DELTA_COMMIT ?? "",
    };
    for (const k of ["HOME", "USER", "LOGNAME", "LANG"]) if (process.env[k]) env[k] = process.env[k]!;
    // Detached: it must outlive this server, which it stops.
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/brew-update.mjs")], {
      detached: true,
      stdio: ["ignore", log, log] as ["ignore", number, number],
      cwd: dir,
      env: env as NodeJS.ProcessEnv,
    });
    child.on("error", () => writeStatus(dir, "failed", { message: "Couldn't start the update." }, 0o700));
    child.unref();
  } finally {
    fs.closeSync(log);
  }
  return requestedAt;
}

// --- backup before an update ---

const KEEP_PRE_UPDATE = 3;

// scripts/backup-db.mjs (the same one the daily job runs), then a copy of
// today's backup under its own name: Delta overwrites that day's file when it
// restarts, so the copy is what a roll back restores. Rejects when it fails.
export async function backupBeforeUpdate(): Promise<void> {
  const db = process.env.DATABASE_PATH ?? "./delta.db";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/backup-db.mjs")], {
      stdio: "ignore",
      env: { ...process.env, DATABASE_PATH: db },
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`backup exited ${code}`))));
  });

  const dir = path.join(path.dirname(db), "backups");
  // backup-db names the file with the UTC date: take the newest, don't recompute it.
  const latest = fs
    .readdirSync(dir)
    .filter((f) => /^delta-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .at(-1);
  if (!latest) throw new Error("no backup written");
  const src = path.join(dir, latest);
  const time = new Date().toISOString().slice(11, 19).replace(/:/g, "");
  const dest = path.join(dir, `${latest.slice(0, -3)}-pre-update-${time}.db`);
  // Private from before the first byte, then the source's own mode.
  fs.closeSync(fs.openSync(dest, "a", 0o600));
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, fs.statSync(src).mode & 0o777);

  const pre = fs
    .readdirSync(dir)
    .filter((f) => /^delta-\d{4}-\d{2}-\d{2}-pre-update-\d{6}\.db$/.test(f))
    .sort();
  for (const f of pre.slice(0, -KEEP_PRE_UPDATE)) fs.unlinkSync(path.join(dir, f));
}
