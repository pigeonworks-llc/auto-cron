import type { Job } from "../entity/job";
import type { ConcurrencyController, AcquireResult } from "../port/concurrency-controller";

// 並列処理 gate — OneshotJob の run-job、 ServiceJob の supervise 両方が
// 呼び出す。 service は通常 1 instance 限定 (起動時に slot 取得)。
export function checkConcurrency(
  job: Job,
  controller: ConcurrencyController,
): AcquireResult {
  return controller.acquire(job);
}
