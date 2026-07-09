// Automated SQLite backup (issue #15): npm run backup
// Uses better-sqlite3's online backup API — safe while the app runs (WAL),
// and the Jetson has no sqlite3 CLI. M6's systemd timer will call this.
// Plain node (.mjs), not tsx: tsx is a devDependency absent from a
// production install.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const src = process.env.DATABASE_PATH ?? "./delta.db";
  const dir = path.join(path.dirname(src), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `delta-${new Date().toISOString().slice(0, 10)}.db`);

  const db = new Database(src, { readonly: true, fileMustExist: true });
  await db.backup(dest);
  db.close();

  // The backup inherits WAL mode, but `sqlite3 -readonly` can't open a WAL
  // db without its -shm file. Flip the copy to a self-contained journal mode.
  const copy = new Database(dest);
  copy.pragma("journal_mode = DELETE");
  copy.close();

  const KEEP = 7;
  const old = fs
    .readdirSync(dir)
    .filter((f) => /^delta-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .slice(0, -KEEP);
  for (const f of old) fs.unlinkSync(path.join(dir, f));

  console.log(`backed up ${src} -> ${dest}${old.length ? `, pruned ${old.length}` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
