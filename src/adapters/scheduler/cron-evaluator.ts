import { Cron } from "croner";
import type { Schedule } from "../../core/entity/schedule";
import type { Scheduler } from "../../core/port/scheduler";

/**
 * nextFireAt — Schedule から「base 以降の最も近い fire 時刻」を返す (epoch ms)。
 *
 * - manual   : POSITIVE_INFINITY (自動発火しない)
 * - interval : base + seconds * 1000
 * - cron     : croner を使って base 以降の最初の発火時刻を計算
 */
export function nextFireAt(schedule: Schedule, base: number): number {
  switch (schedule.kind) {
    case "manual":
      return Number.POSITIVE_INFINITY;
    case "interval": {
      const ms = schedule.seconds * 1000;
      return base + ms;
    }
    case "cron": {
      const c = new Cron(schedule.expr, {
        timezone: schedule.timezone,
      });
      const next = c.nextRun(new Date(base));
      if (next === null) return Number.POSITIVE_INFINITY;
      return next.getTime();
    }
  }
}

/**
 * CronEvaluator — croner を使った Scheduler port 実装。
 * main / wiring 層で inject する。
 */
export class CronEvaluator implements Scheduler {
  nextFireAt(schedule: Schedule, base: number): number {
    return nextFireAt(schedule, base);
  }
}
