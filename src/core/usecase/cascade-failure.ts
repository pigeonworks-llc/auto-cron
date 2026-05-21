import type { OneshotJob } from "../entity/job";
import type { RunStore } from "../port/run-store";
import type { Clock } from "../port/clock";

export interface CascadeFailureInput {
  failedJobName: string;
  allJobs: readonly OneshotJob[];
  runStore: RunStore;
  clock: Clock;
}

export interface CascadeFailureResult {
  blockedJobNames: readonly string[];
}

export async function cascadeFailure(
  input: CascadeFailureInput,
): Promise<CascadeFailureResult> {
  const blocked: string[] = [];
  const visited = new Set<string>([input.failedJobName]);
  const queue: string[] = [input.failedJobName];
  const now = input.clock.now();
  while (queue.length > 0) {
    const parent = queue.shift();
    if (parent === undefined) break;
    for (const job of input.allJobs) {
      if (visited.has(job.name)) continue;
      if ((job.dependsOn ?? []).includes(parent)) {
        visited.add(job.name);
        queue.push(job.name);
        blocked.push(job.name);
        await input.runStore.insert({
          jobId: job.name,
          attempt: 0,
          startedAt: now,
          finishedAt: now,
          exitCode: null,
          stdout: "",
          stderr: "",
          state: "blocked-parent-failed",
          error: `parent_failed: ${input.failedJobName}`,
        });
      }
    }
  }
  return { blockedJobNames: blocked };
}
