import type { ServiceJob } from "../entity/job";
import type { Executor } from "../port/executor";
import type { RunStore } from "../port/run-store";
import type { Clock } from "../port/clock";
import { restartBackoffMsForAttempt } from "../entity/restart-policy";

// supervise — ServiceJob spawn + watch + restart loop。
//
// daemon boot 時に各 ServiceJob に対して 1 つの supervise loop が立ち上がる
// (Phase J で daemon.ts が wire)。 service が crash したら restart policy で
// 再起動、 maxRestarts 到達で諦め、 signal abort で graceful shutdown。
export interface SuperviseDeps {
  executor: Executor;
  runStore: RunStore;
  clock: Clock;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface SuperviseOutcome {
  totalRestarts: number;
  reason: "max-restarts" | "aborted" | "killed";
}

export async function supervise(
  job: ServiceJob,
  deps: SuperviseDeps,
  signal?: AbortSignal,
): Promise<SuperviseOutcome> {
  let attempt = 1;
  let consecutiveFailures = 0;
  const resetAfterSec = job.restart.resetAfterSec ?? 60;
  while (!signal?.aborted) {
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
    const r = await deps.executor.run({
      command: job.command,
      env: job.env,
      signal,
    });
    const finishedAt = deps.clock.now();
    await deps.runStore.setState(runId, {
      state: r.killed ? "killed-by-overlap" : "service-crashed",
      finishedAt,
      exitCode: r.exitCode,
      stdout: r.stdout,
      stderr: r.stderr,
    });
    if (r.killed) return { totalRestarts: attempt - 1, reason: "killed" };
    if (signal?.aborted) return { totalRestarts: attempt - 1, reason: "aborted" };
    // 健全運転 (resetAfterSec 以上 alive) なら consecutive counter リセット
    if (finishedAt - startedAt >= resetAfterSec * 1000) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
    }
    const maxRestarts = job.restart.maxRestarts ?? 0; // 0 = 無限
    if (maxRestarts > 0 && consecutiveFailures > maxRestarts) {
      return { totalRestarts: attempt - 1, reason: "max-restarts" };
    }
    await deps.sleep(
      restartBackoffMsForAttempt(job.restart, attempt + 1),
      signal,
    );
    attempt++;
  }
  return { totalRestarts: attempt - 1, reason: "aborted" };
}
