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
  /**
   * 未発火 job (lastFireAt 未記録) の基準点。呼び出し側が daemon 起動時刻を
   * 1 度だけ束ねて渡す。ここに毎 tick の now を使うと基準が tick ごとに未来へ
   * スライドし、nextFireAt(schedule, now) > now が恒真になって全 oneshot job が
   * 永遠に due にならない (2026-06-30〜07-07 全 fleet 停止 incident の真因)。
   */
  fallbackBase: number;
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
 *   - default: `fallbackBase` (daemon 起動時刻) を起点にする → 次回発火は
 *     「起動後の次の予定時刻」になり、**起動/再起動直後に即発火しない**
 *     (fire-on-boot 抑止)。daemon が launchd KeepAlive で頻繁に再起動しても
 *     定期ジョブが多重発火しない。
 *   - `catchUpOnWake: true` の job のみ起点を 0 にし、起動時に取りこぼし分を
 *     1 回 catch-up 発火させる (opt-in)。
 * 履歴: 当初は常に 0 起点 = 全 job が再起動毎に即発火 (二重送信の一因)。
 * 0909453 で now 起点に変更したが、now は tick ごとに前進するため未発火 job の
 * next が常に未来へ逃げ、全 oneshot が発火不能になった (2026-06-30 incident)。
 * 現在は呼び出し側が固定の fallbackBase を渡す。
 */
export function findDueJobs(input: ScheduleTickInput): readonly DueJob[] {
  const now = input.clock.now();
  const result: DueJob[] = [];
  for (const job of input.jobs) {
    const fallback = job.catchUpOnWake === true ? 0 : input.fallbackBase;
    const last = input.lastFireAt[job.name] ?? fallback;
    const next = input.scheduler.nextFireAt(job.schedule, last);
    if (next <= now) {
      result.push({ job, nextFireAt: next });
    }
  }
  return result;
}
