import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { loadMigrationsFromDir, runMigrations } from "./migration-runner";
import { SqliteRunStore } from "./sqlite-run-store";
import type { JobRun, JobRunState } from "../../core/entity/job-run";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

function makeDb(): Database {
  const db = new Database(":memory:");
  const migrations = loadMigrationsFromDir(MIGRATIONS_DIR);
  runMigrations(db, migrations);
  return db;
}

function makeStore(db: Database): SqliteRunStore {
  return new SqliteRunStore(db);
}

const ALL_STATES: JobRunState[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped-overlap",
  "skipped-queue-full",
  "skipped-dep-not-met",
  "blocked-parent-failed",
  "killed-by-overlap",
  "service-crashed",
];

function baseInput(overrides?: Partial<Omit<JobRun, "runId">>): Omit<JobRun, "runId"> {
  return {
    jobId: "test-job",
    attempt: 1,
    startedAt: 1_000_000,
    finishedAt: null,
    exitCode: null,
    stdout: "",
    stderr: "",
    state: "queued",
    ...overrides,
  };
}

describe("SqliteRunStore — migrations", () => {
  it("applies 001_initial.sql cleanly (user_version=1)", () => {
    const db = new Database(":memory:");
    const migrations = loadMigrationsFromDir(MIGRATIONS_DIR);
    expect(migrations).toHaveLength(1);
    const r = runMigrations(db, migrations);
    expect(r.to).toBe(1);
    expect(r.applied).toEqual([1]);
  });
});

describe("SqliteRunStore — insert / recent round-trip", () => {
  it("insert then recent returns all fields correctly", async () => {
    const store = makeStore(makeDb());
    const input = baseInput({
      jobId: "job-a",
      attempt: 1,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_001_000,
      exitCode: 0,
      stdout: "hello",
      stderr: "err",
      state: "succeeded",
      error: undefined,
    });
    const runId = await store.insert(input);
    expect(typeof runId).toBe("string");
    expect(runId).toHaveLength(26);

    const rows = await store.recent("job-a");
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.runId).toBe(runId);
    expect(row.jobId).toBe("job-a");
    expect(row.attempt).toBe(1);
    expect(row.startedAt).toBe(1_700_000_000_000);
    expect(row.finishedAt).toBe(1_700_000_001_000);
    expect(row.exitCode).toBe(0);
    expect(row.stdout).toBe("hello");
    expect(row.stderr).toBe("err");
    expect(row.state).toBe("succeeded");
    expect(row.error).toBeUndefined();
  });

  it("insert with error field round-trips correctly", async () => {
    const store = makeStore(makeDb());
    const input = baseInput({ state: "failed", error: "something went wrong" });
    const runId = await store.insert(input);
    const rows = await store.recent("test-job");
    expect(rows[0]?.runId).toBe(runId);
    expect(rows[0]?.error).toBe("something went wrong");
  });

  it("recent returns rows newest-first", async () => {
    const store = makeStore(makeDb());
    await store.insert(baseInput({ startedAt: 1000, state: "succeeded" }));
    await store.insert(baseInput({ startedAt: 3000, state: "succeeded" }));
    await store.insert(baseInput({ startedAt: 2000, state: "succeeded" }));
    const rows = await store.recent("test-job");
    expect(rows[0]?.startedAt).toBe(3000);
    expect(rows[1]?.startedAt).toBe(2000);
    expect(rows[2]?.startedAt).toBe(1000);
  });

  it("recent respects limit parameter", async () => {
    const store = makeStore(makeDb());
    for (let i = 0; i < 5; i++) {
      await store.insert(baseInput({ startedAt: i * 1000, state: "succeeded" }));
    }
    const rows = await store.recent("test-job", 3);
    expect(rows).toHaveLength(3);
  });

  it("recent returns empty array for unknown jobId", async () => {
    const store = makeStore(makeDb());
    const rows = await store.recent("no-such-job");
    expect(rows).toEqual([]);
  });
});

describe("SqliteRunStore — setState", () => {
  it("patches state and finishedAt and exitCode", async () => {
    const store = makeStore(makeDb());
    const runId = await store.insert(baseInput({ state: "running", startedAt: 1000 }));
    await store.setState(runId, {
      state: "succeeded",
      finishedAt: 2000,
      exitCode: 0,
    });
    const rows = await store.recent("test-job");
    expect(rows[0]?.state).toBe("succeeded");
    expect(rows[0]?.finishedAt).toBe(2000);
    expect(rows[0]?.exitCode).toBe(0);
  });

  it("patches stdout and stderr", async () => {
    const store = makeStore(makeDb());
    const runId = await store.insert(baseInput({ state: "running" }));
    await store.setState(runId, {
      state: "failed",
      stdout: "out",
      stderr: "err",
      error: "crashed",
    });
    const rows = await store.recent("test-job");
    expect(rows[0]?.stdout).toBe("out");
    expect(rows[0]?.stderr).toBe("err");
    expect(rows[0]?.error).toBe("crashed");
  });

  it("only updates specified fields (others unchanged)", async () => {
    const store = makeStore(makeDb());
    const runId = await store.insert(
      baseInput({ state: "running", stdout: "original", stderr: "original-err" }),
    );
    await store.setState(runId, { state: "succeeded" });
    const rows = await store.recent("test-job");
    expect(rows[0]?.stdout).toBe("original");
    expect(rows[0]?.stderr).toBe("original-err");
  });
});

describe("SqliteRunStore — latestSucceeded", () => {
  it("returns null when no succeeded runs exist", async () => {
    const store = makeStore(makeDb());
    await store.insert(baseInput({ state: "failed" }));
    expect(await store.latestSucceeded("test-job")).toBeNull();
  });

  it("returns null for unknown jobId", async () => {
    const store = makeStore(makeDb());
    expect(await store.latestSucceeded("no-such-job")).toBeNull();
  });

  it("returns latest succeeded among mixed states", async () => {
    const store = makeStore(makeDb());
    const id1 = await store.insert(
      baseInput({ startedAt: 1000, state: "succeeded" }),
    );
    await store.insert(baseInput({ startedAt: 2000, state: "failed" }));
    const id3 = await store.insert(
      baseInput({ startedAt: 3000, state: "succeeded" }),
    );
    await store.insert(baseInput({ startedAt: 4000, state: "running" }));

    const result = await store.latestSucceeded("test-job");
    expect(result).not.toBeNull();
    expect(result!.runId).toBe(id3);
    expect(result!.state).toBe("succeeded");
    // id1 is older succeeded but id3 should win
    expect(result!.runId).not.toBe(id1);
  });
});

describe("SqliteRunStore — runningRuns", () => {
  it("returns only running rows, sorted startedAt ASC", async () => {
    const store = makeStore(makeDb());
    const r1 = await store.insert(
      baseInput({ jobId: "job-a", startedAt: 2000, state: "running" }),
    );
    await store.insert(
      baseInput({ jobId: "job-b", startedAt: 3000, state: "succeeded" }),
    );
    const r2 = await store.insert(
      baseInput({ jobId: "job-c", startedAt: 1000, state: "running" }),
    );
    await store.insert(
      baseInput({ jobId: "job-d", startedAt: 4000, state: "failed" }),
    );

    const rows = await store.runningRuns();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.runId).toBe(r2); // startedAt=1000 first
    expect(rows[1]?.runId).toBe(r1); // startedAt=2000 second
    expect(rows.every((r) => r.state === "running")).toBe(true);
  });

  it("returns empty array when no running runs", async () => {
    const store = makeStore(makeDb());
    await store.insert(baseInput({ state: "succeeded" }));
    expect(await store.runningRuns()).toEqual([]);
  });
});

describe("SqliteRunStore — ULID generation", () => {
  it("generates unique IDs (no duplicates in small sample)", async () => {
    const store = makeStore(makeDb());
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      ids.push(await store.insert(baseInput({ startedAt: i })));
    }
    const unique = new Set(ids);
    expect(unique.size).toBe(20);
  });

  it("generated IDs are 26 characters (Crockford base32 ULID)", async () => {
    const store = makeStore(makeDb());
    const runId = await store.insert(baseInput());
    expect(runId).toHaveLength(26);
  });
});

describe("SqliteRunStore — all JobRunState variants", () => {
  it("inserts all 10 JobRunState values without error", async () => {
    const store = makeStore(makeDb());
    for (const state of ALL_STATES) {
      const runId = await store.insert(baseInput({ state }));
      expect(typeof runId).toBe("string");
    }
    const rows = await store.recent("test-job", 20);
    expect(rows).toHaveLength(ALL_STATES.length);
    const states = rows.map((r) => r.state);
    for (const s of ALL_STATES) {
      expect(states).toContain(s);
    }
  });
});
