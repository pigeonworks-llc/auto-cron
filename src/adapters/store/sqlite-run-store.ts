import { Database } from "bun:sqlite";
import type { JobRun, JobRunState } from "../../core/entity/job-run";
import type { RunStore } from "../../core/port/run-store";

// Lightweight ULID generator (Crockford base32, 26 chars).
// Bun has no built-in ULID; implement minimal version inline (no new deps).
function ulid(): string {
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let time = Date.now();
  const timeStr: string[] = [];
  for (let i = 0; i < 10; i++) {
    timeStr.unshift(ALPHABET[time % 32] ?? "0");
    time = Math.floor(time / 32);
  }
  let randomStr = "";
  for (let i = 0; i < 16; i++) {
    randomStr += ALPHABET[Math.floor(Math.random() * 32)];
  }
  return timeStr.join("") + randomStr;
}

export class SqliteRunStore implements RunStore {
  constructor(private readonly db: Database) {}

  async insert(input: Omit<JobRun, "runId">): Promise<string> {
    const runId = ulid();
    this.db
      .query(
        `INSERT INTO job_runs (run_id, job_id, attempt, started_at, finished_at, exit_code, stdout, stderr, state, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        input.jobId,
        input.attempt,
        input.startedAt,
        input.finishedAt,
        input.exitCode,
        input.stdout,
        input.stderr,
        input.state,
        input.error ?? null,
      );
    return runId;
  }

  async setState(
    runId: string,
    patch: {
      state: JobRunState;
      finishedAt?: number;
      exitCode?: number | null;
      stdout?: string;
      stderr?: string;
      error?: string;
    },
  ): Promise<void> {
    const sets: string[] = ["state = ?"];
    const values: unknown[] = [patch.state];
    if (patch.finishedAt !== undefined) {
      sets.push("finished_at = ?");
      values.push(patch.finishedAt);
    }
    if (patch.exitCode !== undefined) {
      sets.push("exit_code = ?");
      values.push(patch.exitCode);
    }
    if (patch.stdout !== undefined) {
      sets.push("stdout = ?");
      values.push(patch.stdout);
    }
    if (patch.stderr !== undefined) {
      sets.push("stderr = ?");
      values.push(patch.stderr);
    }
    if (patch.error !== undefined) {
      sets.push("error = ?");
      values.push(patch.error);
    }
    values.push(runId);
    this.db
      .query(`UPDATE job_runs SET ${sets.join(", ")} WHERE run_id = ?`)
      .run(...(values as never[]));
  }

  async recent(jobId: string, limit = 10): Promise<readonly JobRun[]> {
    const rows = this.db
      .query(
        `SELECT run_id, job_id, attempt, started_at, finished_at, exit_code, stdout, stderr, state, error
         FROM job_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?`,
      )
      .all(jobId, limit) as Array<Record<string, unknown>>;
    return rows.map(rowToJobRun);
  }

  async latestSucceeded(jobId: string): Promise<JobRun | null> {
    const row = this.db
      .query(
        `SELECT run_id, job_id, attempt, started_at, finished_at, exit_code, stdout, stderr, state, error
         FROM job_runs WHERE job_id = ? AND state = 'succeeded' ORDER BY started_at DESC LIMIT 1`,
      )
      .get(jobId) as Record<string, unknown> | null;
    return row === null ? null : rowToJobRun(row);
  }

  async runningRuns(): Promise<readonly JobRun[]> {
    const rows = this.db
      .query(
        `SELECT run_id, job_id, attempt, started_at, finished_at, exit_code, stdout, stderr, state, error
         FROM job_runs WHERE state = 'running' ORDER BY started_at ASC`,
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToJobRun);
  }
}

function rowToJobRun(row: Record<string, unknown>): JobRun {
  return {
    runId: row.run_id as string,
    jobId: row.job_id as string,
    attempt: row.attempt as number,
    startedAt: row.started_at as number,
    finishedAt: row.finished_at as number | null,
    exitCode: row.exit_code as number | null,
    stdout: row.stdout as string,
    stderr: row.stderr as string,
    state: row.state as JobRunState,
    error: (row.error as string | null) ?? undefined,
  };
}
