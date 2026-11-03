// Container entry point: `next start`, plus scripts/jobs.mjs in the same
// container when DELTA_JOBS is on. Compose files run jobs as their own
// service and leave DELTA_JOBS unset; single-container installs (an Unraid
// template, a plain `docker run`) set DELTA_JOBS=on to get the 6-hour sync
// and daily backup without a second container.
//
// Started as root (`user: "0:0"`, for app stores whose data folders are
// root-owned bind mounts), it hands the data folder to the image's `node`
// user and runs everything as that user. Plain node, no deps.
import { spawn } from "node:child_process";
import { chownSync, lstatSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

const NODE_UID = 1000;
const NODE_GID = 1000;
const asRoot = process.getuid?.() === 0;

function chownTree(path) {
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st || st.isSymbolicLink()) return;
  if (st.uid !== NODE_UID || st.gid !== NODE_GID) chownSync(path, NODE_UID, NODE_GID);
  if (st.isDirectory()) for (const name of readdirSync(path)) chownTree(join(path, name));
}

// Only an absolute data folder (the image's /data): never chown a cwd tree.
const dataDir = dirname(process.env.DATABASE_PATH ?? "/data/delta.db");
if (asRoot && isAbsolute(dataDir) && dataDir !== "/") chownTree(dataDir);

const children = [];
let stopping = false;

function run(args, { critical }) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    ...(asRoot ? { uid: NODE_UID, gid: NODE_GID, env: { ...process.env, HOME: "/home/node" } } : {}),
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (stopping) return;
    if (critical) {
      // The app is the container: when it stops, stop everything.
      shutdown(code ?? (signal ? 1 : 0));
    } else {
      console.error(`jobs exited (${code ?? signal}); restarting in 60s`);
      setTimeout(() => !stopping && run(args, { critical }), 60_000);
    }
  });
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  const alive = children.filter((c) => c.exitCode === null && c.signalCode === null);
  Promise.all(alive.map((c) => new Promise((r) => c.once("exit", r)))).then(() => process.exit(code));
}

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => shutdown(0));

run(["node_modules/next/dist/bin/next", "start"], { critical: true });
if (/^(1|on|true|yes)$/i.test(process.env.DELTA_JOBS ?? "")) {
  run(["scripts/jobs.mjs"], { critical: false });
}
