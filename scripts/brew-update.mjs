// Updates a Homebrew install from the header's Update pill (lib/updater.ts
// starts this, detached, after backing up). Plain node, no deps, no shell:
// fixed argv only. It upgrades the formula, then stops the service with
// SIGTERM; the supervisor (brew services: launchd or a systemd user unit,
// keep_alive) starts the new version. It never calls brew services itself.
//
// Env, set by the app: DELTA_BREW (brew binary), DELTA_UPDATE_DIR,
// DELTA_SERVICE_PID (`delta start`, the service's main process) and
// DELTA_COMMIT (the running version, recorded as `from`). The new build tells
// the app it is done by answering with a different version (the app derives
// `done`, lib/updater.ts); on systemd this helper may die with the service's
// cgroup right after the signal, which is fine.
import { spawn } from "node:child_process";
import { writeStatus } from "./updater-status.mjs";

const brew = process.env.DELTA_BREW;
const dir = process.env.DELTA_UPDATE_DIR;
const pid = Number(process.env.DELTA_SERVICE_PID);
const from = process.env.DELTA_COMMIT;

const log = (...a) => console.log(new Date().toISOString(), "brew-update:", ...a);
const set = (state, extra) => writeStatus(dir, state, extra, 0o700);

// stdout is the log (the app opened brew.log for us); `capture` returns it too.
function run(args, capture = false) {
  return new Promise((resolve) => {
    log("brew", args.join(" "));
    // cwd: the app folder is replaced by the upgrade.
    const child = spawn(brew, args, { cwd: dir, stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"] });
    let out = "";
    child.stdout?.on("data", (c) => (out += c));
    child.on("error", (err) => {
      log("spawn failed:", err.message);
      resolve({ code: -1, out });
    });
    child.on("exit", (code) => resolve({ code: code ?? 1, out: out.trim() }));
  });
}

async function main() {
  if (!brew || !dir || !Number.isInteger(pid) || pid <= 1) throw new Error("DELTA_BREW, DELTA_UPDATE_DIR and DELTA_SERVICE_PID are required");
  // `from` from the start: if Homebrew restarts the service itself during the
  // upgrade, the new build still reads this as finished.
  set("pulling", { message: undefined, from, to: undefined });
  const before = await run(["list", "--versions", "delta"], true);
  const upgrade = await run(["upgrade", "delta"]);
  if (upgrade.code !== 0) {
    set("failed", { message: "Homebrew couldn't upgrade Delta. See brew.log." });
    return;
  }
  const after = await run(["list", "--versions", "delta"], true);
  if (before.code === 0 && after.code === 0 && before.out === after.out) {
    set("current", { message: "Homebrew doesn't have the new version yet. Try again later." });
    return;
  }
  set("restarting", { message: undefined, from });
  log(`restarting: SIGTERM to ${pid}`);
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    // Already gone: something else restarted it, which is all this wanted.
    if (err.code !== "ESRCH") throw err;
  }
}

main().catch((err) => {
  log("failed:", err.message);
  try {
    set("failed", { message: "The update failed. See brew.log." });
  } catch {}
  process.exitCode = 1;
});
