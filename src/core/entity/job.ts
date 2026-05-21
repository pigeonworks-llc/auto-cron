import type { Schedule } from "./schedule";
import type { RetryPolicy } from "./retry-policy";
import type { RestartPolicy } from "./restart-policy";
import type { NotifyPolicy } from "./notify-policy";
import type { ConcurrencyPolicy } from "./concurrency-policy";

// Job — discriminated union by `lifecycle` field.
//
// OneshotJob (default、 lifecycle 省略 or "oneshot"):
//   - schedule に従って fire (cron / interval / manual)
//   - 完了で 1 run 終わり、 retry policy が attempt loop を制御
//   - dependsOn[] / catchUpOnWake / dependsWithinHours が意味を持つ
//   - schedule-tick + run-job + check-deps usecase が扱う
//
// ServiceJob (lifecycle: "service"):
//   - daemon boot 時に spawn、 crash 時 RestartPolicy で再起動
//   - schedule / retry / dependsOn / catchUpOnWake は無い
//     (常駐なので schedule 不要、 retry の代わりに restart を使う、
//      依存関係は dependsOn で表現せず手順上で起動順を制御)
//   - supervise usecase が扱う
//
// 共通: name / command / env / notify / concurrency
//   (concurrency は service にも適用 — group mutex で同 group の service / job が
//    serialize、 global cap は service 起動も 1 slot 占有)
export type Job = OneshotJob | ServiceJob;

interface CommonJobFields {
  name: string;
  command: readonly string[];
  env?: Readonly<Record<string, string>>;
  notify: NotifyPolicy;
  concurrency?: ConcurrencyPolicy;
}

export interface OneshotJob extends CommonJobFields {
  lifecycle?: "oneshot";
  schedule: Schedule;
  retry: RetryPolicy;
  dependsOn?: readonly string[];
  catchUpOnWake?: boolean;
  dependsWithinHours?: number;
}

export interface ServiceJob extends CommonJobFields {
  lifecycle: "service";
  restart: RestartPolicy;
}

/** Type predicate for narrowing at runtime (yaml-job-config / supervise が使う)。 */
export function isServiceJob(job: Job): job is ServiceJob {
  return job.lifecycle === "service";
}
