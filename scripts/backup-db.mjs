// Automated SQLite backup (issue #15): npm run backup
// Uses better-sqlite3's online backup API — safe while the app runs (WAL),
// and the Jetson has no sqlite3 CLI. M6's systemd timer will call this.
// Plain node (.mjs), not tsx: tsx is a devDependency absent from a
// production install.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// A backup holds the Plaid access tokens too, so it is readable by its owner
// only. The exception is a backups folder shared on purpose: a setgid folder
// hands its group to every file in it (how an account that copies backups off
// the machine gets access when Delta runs as another one), and then that
// group may read them. Nobody else, either way.
function backupMode(dir) {
  return fs.statSync(dir).mode & 0o2000 ? 0o640 : 0o600;
}

// Best effort: a file owned by another account, or a filesystem without
// modes, stays as it is.
function setMode(file, mode) {
  try {
    fs.chmodSync(file, mode);
  } catch {}
}

async function main() {
  const src = process.env.DATABASE_PATH ?? "./delta.db";
  const dir = path.join(path.dirname(src), "backups");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dest = path.join(dir, `delta-${new Date().toISOString().slice(0, 10)}.db`);
  // Private from before the first byte is written.
  const mode = backupMode(dir);
  fs.closeSync(fs.openSync(dest, "a", 0o600));
  setMode(dest, mode);

  const db = new Database(src, { readonly: true, fileMustExist: true });
  await db.backup(dest);
  db.close();

  // The backup inherits WAL mode, but `sqlite3 -readonly` can't open a WAL
  // db without its -shm file. Flip the copy to a self-contained journal mode.
  const copy = new Database(dest);
  copy.pragma("journal_mode = DELETE");
  copy.close();

  const KEEP = 7;
  const backups = fs
    .readdirSync(dir)
    .filter((f) => /^delta-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort();
  const old = backups.slice(0, -KEEP);
  for (const f of old) fs.unlinkSync(path.join(dir, f));
  // Backups written before this were readable by every account.
  for (const f of backups.slice(-KEEP)) setMode(path.join(dir, f), mode);

  console.log(`backed up ${src} -> ${dest}${old.length ? `, pruned ${old.length}` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
