import type { OneshotJob } from "../entity/job";
import type { Scheduler } from "../port/scheduler";

// detect-silence — daemon が生きている状態で「予定時刻 + grace を過ぎても
// 走っていない OneshotJob」を返す純粋関数。daemon が低頻度 (例 5 分) で sweep し、
// 検知 job を notifier (warn) で通知する。daemon 自体の死活は外部 watchdog (heartbeat)
// が見るので、ここは「daemon 生存下で個別 job が黙った」ケースだけを担う。
//
// 判定: now > nextFireAt(schedule, base) + grace。
//   base = 最終 started_at (recent から)、無ければ fallbackBase (daemon 起動時刻)。
// manual job (nextFireAt=Infinity) は対象外。

export interface SilenceInput {
  jobs: readonly OneshotJob[];
  /** jobName -> 最終 run の started_at (epoch ms)。未実行は undefined。 */
  lastStartedAt: Readonly<Record<string, number | undefined>>;
  now: number;
  graceMs: number;
  /** 未実行 job の base (通常は daemon 起動時刻)。 */
  fallbackBase: number;
  scheduler: Scheduler;
}

export interface SilentJob {
  job: OneshotJob;
  /** 期待発火時刻 (epoch ms)。 */
  expectedAt: number;
  /** 期待発火からの超過 (ms)。 */
  overdueByMs: number;
}

export function detectSilentJobs(input: SilenceInput): readonly SilentJob[] {
  const out: SilentJob[] = [];
  for (const job of input.jobs) {
    if (job.schedule.kind === "manual") continue;
    const base = input.lastStartedAt[job.name] ?? input.fallbackBase;
    const expectedAt = input.scheduler.nextFireAt(job.schedule, base);
    if (!Number.isFinite(expectedAt)) continue;
    if (input.now > expectedAt + input.graceMs) {
      out.push({ job, expectedAt, overdueByMs: input.now - expectedAt });
    }
  }
  return out;
}
