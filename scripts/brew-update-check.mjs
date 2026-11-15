// Self-check for scripts/brew-update.mjs: runs the real script against a fake
// `brew` and a dummy "service" process. node scripts/brew-update-check.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brew-update-"));
const script = path.resolve("scripts/brew-update.mjs");

// brew list --versions delta: prints versions file. brew upgrade delta: copies
// the status file (to prove `pulling` was visible), then behaves by `mode`.
const fake = path.join(tmp, "brew");
fs.writeFileSync(
  fake,
  `#!/bin/sh
cd "$(dirname "$0")"
case "$1" in
  list) cat versions ;;
  upgrade)
    cp update/status.json seen.json
    case "$(cat mode)" in
      success) echo "delta 2.0.0" > versions ;;
      fail) echo "boom" >&2; exit 1 ;;
      same) ;;
    esac ;;
esac
`,
  { mode: 0o755 },
);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function scenario(mode) {
  const dir = path.join(tmp, "update");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(path.join(tmp, "seen.json"), { force: true });
  fs.writeFileSync(path.join(tmp, "versions"), "delta 1.0.0\n");
  fs.writeFileSync(path.join(tmp, "mode"), mode);
  const marker = path.join(tmp, "got-sigterm");
  fs.rmSync(marker, { force: true });
  // The "service": records SIGTERM and exits.
  const service = spawn(
    process.execPath,
    ["-e", `process.on("SIGTERM",()=>{require("fs").writeFileSync(${JSON.stringify(marker)},"x");process.exit(0)});setInterval(()=>{},1000)`],
    { stdio: "ignore" },
  );
  await wait(300);
  const helper = spawn(process.execPath, [script], {
    stdio: "ignore",
    env: { PATH: process.env.PATH, DELTA_BREW: fake, DELTA_UPDATE_DIR: dir, DELTA_SERVICE_PID: String(service.pid), DELTA_COMMIT: "v1.0.0" },
  });
  const code = await new Promise((r) => helper.on("exit", r));
  await wait(500);
  const status = JSON.parse(fs.readFileSync(path.join(dir, "status.json"), "utf8"));
  const seen = fs.existsSync(path.join(tmp, "seen.json")) ? JSON.parse(fs.readFileSync(path.join(tmp, "seen.json"), "utf8")) : null;
  const termed = fs.existsSync(marker);
  service.kill("SIGKILL");
  return { code, status, seen, termed };
}

const ok = await scenario("success");
assert.equal(ok.code, 0);
assert.equal(ok.seen.state, "pulling");
assert.equal(ok.status.state, "restarting");
assert.equal(ok.status.from, "v1.0.0");
assert.ok(ok.termed, "the service is stopped so its supervisor restarts it");

const fail = await scenario("fail");
assert.equal(fail.status.state, "failed");
assert.match(fail.status.message, /brew\.log/);
assert.ok(!fail.termed);

const same = await scenario("same");
assert.equal(same.status.state, "current");
assert.ok(!same.termed);

// Without what it needs it refuses, and stops nothing.
const bad = spawn(process.execPath, [script], { stdio: "ignore", env: { PATH: process.env.PATH } });
assert.equal(await new Promise((r) => bad.on("exit", r)), 1);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("brew-update-check: ok");
