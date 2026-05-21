import type { OneshotJob } from "../entity/job";
import type { Clock } from "../port/clock";

// schedule-tick — OneshotJob 群について「now で fire すべきか」 を判定。
// ServiceJob は対象外 (常駐なので tick fire の概念無し)。
// Phase E で croner library を使う実装に置き換わるが、 ここでは pure な
// interface だけ。 lastFireAt は in-memory state (daemon が tick 間で保持)。
export interface ScheduleTickInput {
  jobs: readonly OneshotJob[];
  lastFireAt: Readonly<Record<string, number>>;
  clock: Clock;
}

export interface DueJob {
  job: OneshotJob;
  nextFireAt: number;
}

// Phase B では skeleton — 全 Job を「due」 として返す naive 実装 (test 用)。
export function findDueJobs(input: ScheduleTickInput): readonly DueJob[] {
  const now = input.clock.now();
  return input.jobs.map((job) => ({ job, nextFireAt: now }));
}
