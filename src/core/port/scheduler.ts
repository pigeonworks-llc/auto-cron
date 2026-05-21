import type { Schedule } from "../entity/schedule";

// Scheduler port — Schedule から次の fire 時刻 (epoch ms) を計算する純粋関数ポート。
// manual は POSITIVE_INFINITY。 interval は base + seconds*1000。
// cron は base 以降の最も近い発火時刻。
// 実装: src/adapters/scheduler/cron-evaluator.ts (CronEvaluator)。
export interface Scheduler {
  nextFireAt(schedule: Schedule, base: number): number;
}
