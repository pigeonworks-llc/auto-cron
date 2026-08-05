import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// openDb is the single DB-open path for auto-cron. It ensures the parent dir
// exists and sets WAL journal mode (CLAUDE.md "SQLite + WAL" rule; the runs.db
// was flagged by sqlite-inventory wal-violations). Callers (di.ts) use this so
// the WAL setting can be tested without wiring the whole app.
export function openDb(dbPath: string): Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}
