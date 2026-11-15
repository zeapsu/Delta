// status.json in <data dir>/update/: how the updater (scripts/updater.mjs,
// scripts/brew-update.mjs) tells the app how an update is going. Shared by
// both and by lib/updater.ts. Plain node, no deps.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cleanStatus } from "./updater-lib.mjs";

// The directory is readable by everyone and writable by the app's user: the
// updater (root, in Docker) creates it and hands it to the data folder's owner
// so the app can drop `request` in it.
export function ensureDir(dir, mode = 0o755) {
  // The data folder belongs to the app's user, and the updater is root: a link
  // or file planted where the directory should be is removed, never followed.
  const st = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (st && !st.isDirectory()) fs.rmSync(dir, { force: true });
  fs.mkdirSync(dir, { recursive: true, mode });
  try {
    const parent = fs.statSync(path.dirname(dir));
    fs.lchownSync(dir, parent.uid, parent.gid);
  } catch {}
  try {
    fs.chmodSync(dir, mode);
  } catch {}
}

export function readStatus(dir) {
  try {
    return cleanStatus(JSON.parse(fs.readFileSync(path.join(dir, "status.json"), "utf8")));
  } catch {
    return null;
  }
}

// Atomic: a reader never sees half a file. The temp name is random and created
// exclusively, since the directory is writable by the app's user. requestedAt
// carries over from the file already there unless given.
export function writeStatus(dir, state, extra = {}, mode = 0o755) {
  ensureDir(dir, mode);
  const prev = readStatus(dir);
  const next = { state, at: Date.now(), ...(prev?.requestedAt ? { requestedAt: prev.requestedAt } : {}), ...extra };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  const tmp = path.join(dir, `.status-${crypto.randomBytes(6).toString("hex")}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(next), { flag: "wx", mode: 0o644 });
  fs.chmodSync(tmp, 0o644);
  fs.renameSync(tmp, path.join(dir, "status.json"));
}
