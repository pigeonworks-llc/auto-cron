import type { OneshotJob } from "../entity/job";
import type { Executor, ExecResult } from "../port/executor";
import type { RunStore } from "../port/run-store";
import type { Clock } from "../port/clock";
import { backoffMsForAttempt } from "../entity/retry-policy";

export interface RunJobDeps {
  executor: Executor;
  runStore: RunStore;
  clock: Clock;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface RunJobOutcome {
  finalAttempt: number;
  finalExit: ExecResult;
  finalFailure: boolean;
  /** すべての attempt 分の RunId (debug / audit 用)。 */
  runIds: readonly string[];
}

export async function runJob(
  job: OneshotJob,
  deps: RunJobDeps,
  signal?: AbortSignal,
): Promise<RunJobOutcome> {
  const runIds: string[] = [];
  let attempt = 1;
  let lastExit: ExecResult = { exitCode: -1, stdout: "", stderr: "", killed: false };
  while (attempt <= job.retry.maxAttempts) {
    if (signal?.aborted) {
      return { finalAttempt: attempt - 1, finalExit: lastExit, finalFailure: true, runIds };
    }
    const startedAt = deps.clock.now();
    const runId = await deps.runStore.insert({
      jobId: job.name,
      attempt,
      startedAt,
      finishedAt: null,
      exitCode: null,
      stdout: "",
      stderr: "",
      state: "running",
    });
    runIds.push(runId);
    lastExit = await deps.executor.run({ command: job.command, env: job.env, signal });
    const finishedAt = deps.clock.now();
    const succeeded = lastExit.exitCode === 0;
    await deps.runStore.setState(runId, {
      state: succeeded ? "succeeded" : "failed",
      finishedAt,
      exitCode: lastExit.exitCode,
      stdout: lastExit.stdout,
      stderr: lastExit.stderr,
    });
    if (succeeded) {
      return { finalAttempt: attempt, finalExit: lastExit, finalFailure: false, runIds };
    }
    // failed: backoff to next attempt (or exit loop if exhausted)
    if (attempt >= job.retry.maxAttempts) break;
    const ms = backoffMsForAttempt(job.retry, attempt + 1);
    if (ms > 0) await deps.sleep(ms, signal);
    attempt++;
  }
  // final failure
  return { finalAttempt: attempt, finalExit: lastExit, finalFailure: true, runIds };
}
