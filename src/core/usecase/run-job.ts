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
}

// Phase B では skeleton — 1 回 exec して return (retry loop なし)。
// Phase F で retry policy 完全実装。
export async function runJob(
  job: OneshotJob,
  deps: RunJobDeps,
  signal?: AbortSignal,
): Promise<RunJobOutcome> {
  const startedAt = deps.clock.now();
  const runId = await deps.runStore.insert({
    jobId: job.name,
    attempt: 1,
    startedAt,
    finishedAt: null,
    exitCode: null,
    stdout: "",
    stderr: "",
    state: "running",
  });
  const r = await deps.executor.run({
    command: job.command,
    env: job.env,
    signal,
  });
  await deps.runStore.setState(runId, {
    state: r.exitCode === 0 ? "succeeded" : "failed",
    finishedAt: deps.clock.now(),
    exitCode: r.exitCode,
    stdout: r.stdout,
    stderr: r.stderr,
  });
  void backoffMsForAttempt;
  return {
    finalAttempt: 1,
    finalExit: r,
    finalFailure: r.exitCode !== 0,
  };
}
