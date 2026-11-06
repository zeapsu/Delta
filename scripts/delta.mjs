#!/usr/bin/env node
// `delta`: run Delta natively, without Docker. The Homebrew formula
// (homebrew/delta.rb) installs a built copy and puts this on PATH as `delta`;
// `brew services start delta` runs `delta start`. From a built checkout it
// also works as `node scripts/delta.mjs <command>`.
//
// Data and settings live in DELTA_HOME (Homebrew: $(brew --prefix)/var/delta,
// else ~/.delta): delta.db, backups/, and delta.env, which `delta phone` and
// `delta local` edit and every command loads. Plain node, no deps.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const HOME = process.env.DELTA_HOME || join(homedir(), ".delta");
const ENV_FILE = join(HOME, "delta.env");
const brew = process.env.DELTA_INSTALL === "brew";

const HELP = `Usage: delta <command>

  start      Run Delta and its sync and backup jobs${brew ? " (brew services runs this)" : ""}
  open       Open Delta in the browser
  phone      Serve Delta on this computer's Tailscale address, for your phone
  local      Back to this computer only (the default)
  token      Agent tokens: delta token create <name> [--scope read|write] | list | revoke <id>
  backup     Back up the database now (keeps 7)
  unlink     Remove every bank from Plaid (run before uninstalling)

Data and settings: ${HOME}`;

// --- delta.env --------------------------------------------------------------

// Lines of delta.env, or none yet.
function envLines() {
  try {
    return readFileSync(ENV_FILE, "utf8").split("\n");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

function readEnvFile() {
  const out = {};
  for (const line of envLines()) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

function setEnvValue(key, value) {
  const lines = envLines();
  const i = lines.findIndex((l) => l.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1] === key);
  const line = `${key}=${value}`;
  if (i >= 0) lines[i] = line;
  else lines.splice(lines.at(-1) === "" ? lines.length - 1 : lines.length, 0, line);
  writeFileSync(ENV_FILE, lines.join("\n").replace(/\n*$/, "\n"));
}

// The process environment wins over delta.env, like process.loadEnvFile.
// The address is read key by key: it gets printed, the rest of the
// environment (which can hold Plaid keys) never is.
function settings() {
  const file = readEnvFile();
  const env = { ...file, ...process.env };
  const host = process.env.DELTA_BIND || file.DELTA_BIND || "127.0.0.1";
  const port = process.env.PORT || file.PORT || "3000";
  const url = `http://${host}:${port}`;
  return {
    host,
    port,
    url,
    env: {
      ...env,
      NODE_ENV: "production",
      DELTA_HOME: HOME,
      DATABASE_PATH: env.DATABASE_PATH || join(HOME, "delta.db"),
      PORT: port,
      DELTA_HOSTNAME: host,
      DELTA_URL: env.DELTA_URL || url,
      DELTA_INTERNAL_URL: url,
      DELTA_JOBS: env.DELTA_JOBS || "on",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  };
}

// --- helpers ----------------------------------------------------------------

function tailscaleIp() {
  for (const ts of ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"]) {
    const r = spawnSync(ts, ["ip", "-4"], { encoding: "utf8" });
    const ip = r.status === 0 ? r.stdout.trim().split("\n")[0] : "";
    if (ip) return ip;
  }
  return null;
}

function openUrl(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "linux" ? "xdg-open" : null;
  if (cmd) spawn(cmd, [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

// After a bind change: restart the service if brew runs it, else say so.
function restart(url) {
  if (brew && spawnSync("brew", ["services", "restart", "delta"], { stdio: "inherit" }).status === 0) {
    console.log(`Delta is at ${url}`);
  } else {
    console.log(`Saved. Restart Delta, then open ${url}`);
  }
}

// Run a script from the app folder with Delta's settings; exit with its code.
function runScript(args) {
  const { env } = settings();
  const r = spawnSync(process.execPath, args, { cwd: APP, env, stdio: "inherit" });
  process.exit(r.status ?? 1);
}

// --- commands ---------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "start": {
    mkdirSync(HOME, { recursive: true });
    const { env, url } = settings();
    console.log(`Delta at ${url} (data in ${HOME})`);
    const child = spawn(process.execPath, ["scripts/start.mjs"], { cwd: APP, env, stdio: "inherit" });
    for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => child.kill(sig));
    child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
    break;
  }
  case "open": {
    const { url } = settings();
    openUrl(url);
    console.log(`${url} (not loading? ${brew ? "brew services start delta" : "delta start"})`);
    break;
  }
  case "phone": {
    const ip = tailscaleIp();
    if (!ip) {
      console.error("Tailscale isn't running here. Install it from https://tailscale.com/download, sign in, then run: delta phone");
      process.exit(1);
    }
    mkdirSync(HOME, { recursive: true });
    setEnvValue("DELTA_BIND", ip);
    console.log(`Delta will listen on your Tailscale address only: ${ip}. Use that address on this computer too.`);
    restart(settings().url);
    break;
  }
  case "local": {
    mkdirSync(HOME, { recursive: true });
    setEnvValue("DELTA_BIND", "127.0.0.1");
    console.log("Delta will listen on this computer only.");
    restart(settings().url);
    break;
  }
  case "token":
    runScript(["node_modules/tsx/dist/cli.mjs", "scripts/api-token.ts", ...rest]);
    break;
  case "backup":
    runScript(["scripts/backup-db.mjs"]);
    break;
  case "unlink":
    runScript(["node_modules/tsx/dist/cli.mjs", "scripts/unlink-items.ts", ...rest]);
    break;
  case undefined:
  case "help":
  case "-h":
  case "--help":
    console.log(HELP);
    break;
  default:
    console.error(`Unknown command: ${command}\n\n${HELP}`);
    process.exit(1);
}
