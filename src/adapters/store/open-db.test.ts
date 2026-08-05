import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./open-db";

// openDb must put a file DB into WAL journal mode (WAL is a no-op on :memory:).
test("openDb sets WAL journal mode on a file DB", () => {
  const dbPath = join(
    tmpdir(),
    `auto-cron-opendb-${process.pid}-${globalThis.performance.now()}.db`,
  );
  const db = openDb(dbPath);
  const mode = db.query("PRAGMA journal_mode").get() as {
    journal_mode: string;
  };
  db.close();
  expect(mode.journal_mode.toLowerCase()).toBe("wal");
});

test("openDb creates the parent directory", () => {
  const dbPath = join(
    tmpdir(),
    `auto-cron-opendb-${process.pid}-${globalThis.performance.now()}`,
    "nested",
    "runs.db",
  );
  const db = openDb(dbPath);
  db.close();
  // If mkdir failed, openDb would have thrown; reaching here means it worked.
  expect(true).toBe(true);
});
