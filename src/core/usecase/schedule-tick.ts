import type { OneshotJob } from "../entity/job";
import type { Clock } from "../port/clock";
import type { Scheduler } from "../port/scheduler";

// schedule-tick — OneshotJob 群について「now で fire すべきか」 を判定。
// ServiceJob は対象外 (常駐なので tick fire の概念無し)。
// lastFireAt は in-memory state (daemon が tick 間で保持)。
// Scheduler port は croner-backed CronEvaluator を main 層で inject する。
export interface ScheduleTickInput {
  jobs: readonly OneshotJob[];
  lastFireAt: Readonly<Record<string, number>>;
  clock: Clock;
  scheduler: Scheduler;
}

export interface DueJob {
  job: OneshotJob;
  nextFireAt: number;
}

/**
 * findDueJobs — now 時点で発火すべき OneshotJob を返す。
 *
 * 各 job の「次の発火時刻」を Scheduler.nextFireAt(schedule, lastFireAt) で算出し、
 * その時刻が now 以下であれば due と判定する。
 * lastFireAt が未記録 (= 初回) の場合は 0 を使う。
 */
export function findDueJobs(input: ScheduleTickInput): readonly DueJob[] {
  const now = input.clock.now();
  const result: DueJob[] = [];
  for (const job of input.jobs) {
    const last = input.lastFireAt[job.name] ?? 0;
    const next = input.scheduler.nextFireAt(job.schedule, last);
    if (next <= now) {
      result.push({ job, nextFireAt: next });
    }
  }
  return result;
}
