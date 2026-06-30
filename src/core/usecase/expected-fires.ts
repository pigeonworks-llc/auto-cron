import { Cron } from "croner";
import type { Schedule } from "../entity/schedule";

// expected-fires — L3 daily inventory の「予定」側。指定 window [fromMs, toMs) で
// schedule が何回発火する予定だったかを数える純粋関数。runs.db から得る actual と
// 突合し、under-run (沈黙) / over-run (二重実行 = incident 指紋) を検出する。
//
// cron 解釈の SoT は croner (cron-evaluator と同じ) に集約 — shell 側に別 parser を
// 置くと daemon とズレるため、auto-cron 側でこの helper を持つ。

const MAX_ITER = 200_000; // safety cap (1 分毎でも 1 日 1440、年でも上限内)

export function countFires(schedule: Schedule, fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  switch (schedule.kind) {
    case "manual":
      return 0;
    case "interval": {
      const ms = schedule.seconds * 1000;
      if (ms <= 0) return 0;
      return Math.floor((toMs - fromMs) / ms);
    }
    case "cron": {
      const c = new Cron(
        schedule.expr,
        schedule.timezone !== undefined ? { timezone: schedule.timezone } : {},
      );
      let count = 0;
      // fromMs-1 を起点にすると window 開始ちょうどの発火も拾える
      // (croner nextRun は strictly-after を返す)。
      let cursor = new Date(fromMs - 1);
      for (let i = 0; i < MAX_ITER; i++) {
        const next = c.nextRun(cursor);
        if (next === null) break;
        const t = next.getTime();
        if (t >= toMs) break;
        count++;
        cursor = next;
      }
      return count;
    }
  }
}
