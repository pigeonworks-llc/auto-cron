import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runMigrations,
  loadMigrationsFromDir,
  type Migration,
} from "./migration-runner";

describe("runMigrations", () => {
  it("starts at user_version=0 on a fresh DB and applies version 1", () => {
    const db = new Database(":memory:");
    const ms: Migration[] = [
      { version: 1, name: "initial", sql: "CREATE TABLE foo (id INTEGER)" },
    ];
    const r = runMigrations(db, ms);
    expect(r.from).toBe(0);
    expect(r.to).toBe(1);
    expect(r.applied).toEqual([1]);
    const v = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
    expect(v?.user_version).toBe(1);
  });

  it("is idempotent — running twice applies migrations only once", () => {
    const db = new Database(":memory:");
    const ms: Migration[] = [
      { version: 1, name: "initial", sql: "CREATE TABLE foo (id INTEGER)" },
    ];
    runMigrations(db, ms);
    const r2 = runMigrations(db, ms);
    expect(r2.from).toBe(1);
    expect(r2.to).toBe(1);
    expect(r2.applied).toEqual([]);
  });

  it("applies migrations in version order even if input is shuffled", () => {
    const db = new Database(":memory:");
    const ms: Migration[] = [
      { version: 2, name: "second", sql: "CREATE TABLE bar (id INTEGER)" },
      { version: 1, name: "first", sql: "CREATE TABLE foo (id INTEGER)" },
    ];
    const r = runMigrations(db, ms);
    expect(r.applied).toEqual([1, 2]);
    expect(
      db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: "bar" }, { name: "foo" }]);
  });

  it("applies only migrations whose version exceeds current user_version", () => {
    const db = new Database(":memory:");
    const ms1: Migration[] = [
      { version: 1, name: "v1", sql: "CREATE TABLE a (id INTEGER)" },
    ];
    runMigrations(db, ms1);
    const ms2: Migration[] = [
      ...ms1,
      { version: 2, name: "v2", sql: "CREATE TABLE b (id INTEGER)" },
    ];
    const r = runMigrations(db, ms2);
    expect(r.from).toBe(1);
    expect(r.to).toBe(2);
    expect(r.applied).toEqual([2]);
  });

  it("rolls back partial migration on SQL error — user_version stays put", () => {
    const db = new Database(":memory:");
    const ms: Migration[] = [
      { version: 1, name: "good", sql: "CREATE TABLE ok (id INTEGER)" },
      { version: 2, name: "broken", sql: "THIS IS NOT VALID SQL;" },
    ];
    expect(() => runMigrations(db, ms)).toThrow();
    const v = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
    // v1 applied, v2 rolled back.
    expect(v?.user_version).toBe(1);
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ok'",
      )
      .all();
    expect(tables).toEqual([{ name: "ok" }]);
  });

  it("rejects duplicate versions in the migration list", () => {
    const db = new Database(":memory:");
    const ms: Migration[] = [
      { version: 1, name: "a", sql: "CREATE TABLE a (id INTEGER)" },
      { version: 1, name: "b", sql: "CREATE TABLE b (id INTEGER)" },
    ];
    expect(() => runMigrations(db, ms)).toThrow(/duplicate version/i);
  });

  it("rejects version <= 0 (PRAGMA user_version starts at 0 by convention)", () => {
    const db = new Database(":memory:");
    expect(() =>
      runMigrations(db, [
        { version: 0, name: "zero", sql: "CREATE TABLE z (id INTEGER)" },
      ]),
    ).toThrow(/version must be >= 1/i);
  });
});

describe("loadMigrationsFromDir", () => {
  it("reads NNN_name.sql files and parses version + name in order", () => {
    const dir = mkdtempSync(join(tmpdir(), "auto-cron-mig-"));
    writeFileSync(join(dir, "001_initial.sql"), "CREATE TABLE a (id INTEGER);");
    writeFileSync(join(dir, "002_second.sql"), "CREATE TABLE b (id INTEGER);");
    const ms = loadMigrationsFromDir(dir);
    expect(ms).toHaveLength(2);
    expect(ms[0]?.version).toBe(1);
    expect(ms[0]?.name).toBe("initial");
    expect(ms[0]?.sql).toContain("CREATE TABLE a");
    expect(ms[1]?.version).toBe(2);
    expect(ms[1]?.name).toBe("second");
  });

  it("ignores files that don't match NNN_name.sql (non-numeric prefix)", () => {
    const dir = mkdtempSync(join(tmpdir(), "auto-cron-mig-"));
    writeFileSync(join(dir, "001_initial.sql"), "CREATE TABLE a (id INTEGER);");
    writeFileSync(join(dir, "README.md"), "notes");
    writeFileSync(join(dir, "schema.sql"), "-- ignored");
    writeFileSync(join(dir, "abc_initial.sql"), "-- non-numeric prefix ignored");
    const ms = loadMigrationsFromDir(dir);
    expect(ms).toHaveLength(1);
    expect(ms[0]?.name).toBe("initial");
  });

  it("returns empty array for empty directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "auto-cron-mig-"));
    const ms = loadMigrationsFromDir(dir);
    expect(ms).toEqual([]);
  });

  it("returns empty array for nonexistent directory", () => {
    const ms = loadMigrationsFromDir("/tmp/__does_not_exist_auto_cron__");
    expect(ms).toEqual([]);
  });

  it("round-trips through runMigrations on a real DB", () => {
    const dir = mkdtempSync(join(tmpdir(), "auto-cron-mig-"));
    writeFileSync(join(dir, "001_initial.sql"), "CREATE TABLE t (x TEXT);");
    const db = new Database(":memory:");
    const ms = loadMigrationsFromDir(dir);
    const r = runMigrations(db, ms);
    expect(r.to).toBe(1);
    expect(r.applied).toEqual([1]);
    // idempotent
    const r2 = runMigrations(db, ms);
    expect(r2.applied).toEqual([]);
  });
});
