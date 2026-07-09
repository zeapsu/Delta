import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH ?? "./delta.db";

// ponytail: globalThis guard so Next dev hot-reload doesn't reopen the DB / re-run migrations.
const globalForDb = globalThis as unknown as {
  __deltaSqlite?: Database.Database;
  __deltaDb?: BetterSQLite3Database<typeof schema>;
};

function createDb() {
  const sqlite = globalForDb.__deltaSqlite ?? new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });

  globalForDb.__deltaSqlite = sqlite;
  globalForDb.__deltaDb = db;
  return db;
}

export const db = globalForDb.__deltaDb ?? createDb();
