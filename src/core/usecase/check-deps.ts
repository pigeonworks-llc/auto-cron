import type { OneshotJob } from "../entity/job";
import type { RunStore } from "../port/run-store";
import type { Clock } from "../port/clock";

const DEFAULT_DEPS_WITHIN_HOURS = 24;

export interface CheckDepsInput {
  job: OneshotJob;
  runStore: RunStore;
  clock: Clock;
}

export interface CheckDepsResult {
  ok: boolean;
  unmet: readonly string[];
}

export async function checkDeps(input: CheckDepsInput): Promise<CheckDepsResult> {
  const deps = input.job.dependsOn ?? [];
  if (deps.length === 0) return { ok: true, unmet: [] };
  const withinH = input.job.dependsWithinHours ?? DEFAULT_DEPS_WITHIN_HOURS;
  const cutoff = input.clock.now() - withinH * 60 * 60 * 1000;
  const unmet: string[] = [];
  for (const depName of deps) {
    const latest = await input.runStore.latestSucceeded(depName);
    if (latest === null || (latest.finishedAt ?? 0) < cutoff) {
      unmet.push(depName);
    }
  }
  return { ok: unmet.length === 0, unmet };
}
