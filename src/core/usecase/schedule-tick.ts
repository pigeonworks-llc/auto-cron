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
 *
 * lastFireAt が未記録 (= この daemon プロセスで一度も発火していない初回) の扱い:
 *   - default: `now` を起点にする → 次回発火は「次の予定時刻」になり、
 *     **起動/再起動直後に即発火しない** (fire-on-boot 抑止)。daemon が
 *     launchd KeepAlive で頻繁に再起動しても定期ジョブが多重発火しない。
 *   - `catchUpOnWake: true` の job のみ起点を 0 にし、起動時に取りこぼし分を
 *     1 回 catch-up 発火させる (opt-in)。
 * これ以前は常に 0 起点 = 全 job が再起動毎に即発火しており、二重送信の一因だった。
 */
export function findDueJobs(input: ScheduleTickInput): readonly DueJob[] {
  const now = input.clock.now();
  const result: DueJob[] = [];
  for (const job of input.jobs) {
    const fallback = job.catchUpOnWake === true ? 0 : now;
    const last = input.lastFireAt[job.name] ?? fallback;
    const next = input.scheduler.nextFireAt(job.schedule, last);
    if (next <= now) {
      result.push({ job, nextFireAt: next });
    }
  }
  return result;
}
