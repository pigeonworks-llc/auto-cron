import type { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Versioned migration runner backed by SQLite's PRAGMA user_version.
//
// Design notes:
//   - Each migration runs inside its own transaction so a partial
//     failure rolls back cleanly. The user_version bump is part of the
//     same transaction so the DB never advertises a version it hasn't
//     fully reached.
//   - Migrations are sorted by `version` ascending — input order is
//     not trusted. Duplicate versions are rejected upfront.
//   - version 0 is reserved (matches PRAGMA's fresh-DB default), so
//     migrations must start at 1.
//   - This module knows nothing about which migrations exist — callers
//     either pass a static list or use `loadMigrationsFromDir` to
//     discover NNN_name.sql files.

export interface Migration {
  /** Monotonically increasing integer >= 1. */
  version: number;
  /** Short human-readable label, surfaced in error messages. */
  name: string;
  /** Raw SQL to execute. May contain multiple statements. */
  sql: string;
}

export interface RunMigrationsResult {
  /** user_version before any migration ran. */
  from: number;
  /** user_version after all eligible migrations applied. */
  to: number;
  /** Versions of migrations that actually ran this call (in order). */
  applied: number[];
}

export function runMigrations(
  db: Database,
  migrations: readonly Migration[],
): RunMigrationsResult {
  for (const m of migrations) {
    if (m.version < 1) {
      throw new Error(
        `migration "${m.name}": version must be >= 1 (got ${m.version})`,
      );
    }
  }
  const seen = new Set<number>();
  for (const m of migrations) {
    if (seen.has(m.version)) {
      throw new Error(`duplicate version ${m.version} in migration list`);
    }
    seen.add(m.version);
  }
  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  const from =
    db.query<{ user_version: number }, []>("PRAGMA user_version").get()
      ?.user_version ?? 0;
  const applied: number[] = [];
  let current = from;

  for (const m of sorted) {
    if (m.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      // PRAGMA user_version doesn't accept parameter binding — value is
      // an integer we control (filename-derived), so direct interpolation
      // is safe.
      db.exec(`PRAGMA user_version = ${m.version | 0}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(
        `migration ${m.version} (${m.name}) failed: ${(e as Error).message}`,
        { cause: e },
      );
    }
    applied.push(m.version);
    current = m.version;
  }
  return { from, to: current, applied };
}

/**
 * Read NNN_name.sql files from a directory and return them as
 * Migration objects. Filenames not matching the pattern are silently
 * ignored (so README.md, schema.sql leftovers, etc. don't break us).
 */
export function loadMigrationsFromDir(dir: string): Migration[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: Migration[] = [];
  const re = /^(\d{3,})_([a-z0-9_-]+)\.sql$/i;
  for (const f of names) {
    const m = re.exec(f);
    if (!m) continue;
    const version = Number.parseInt(m[1]!, 10);
    const name = m[2]!;
    const sql = readFileSync(join(dir, f), "utf-8");
    out.push({ version, name, sql });
  }
  out.sort((a, b) => a.version - b.version);
  return out;
}
